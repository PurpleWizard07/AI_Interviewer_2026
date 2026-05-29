import { useCallback, useEffect, useRef, useState } from 'react'
import { buildSystemPrompt } from '../prompts/systemPrompt'
import { callGemini, scoreInterview, type GeminiTurn, type InterviewerResponse } from '../services/gemini'
import type { InterviewSession, Message } from '../types'
import { saveSession } from '../utils'
import { isInWrapUpWindow, wrapUpThresholdSeconds } from '../utils/interviewTiming'

const MAX_FOLLOWUPS_PER_QUESTION = 2

// ─── State machine ─────────────────────────────────────────────────────────────

export type InterviewState =
  | 'idle'        // Not started
  | 'thinking'    // Waiting for Gemini response
  | 'responding'  // Gemini responded — caller should speak the message
  | 'listening'   // Waiting for candidate's answer
  | 'scoring'     // End of interview — generating debrief
  | 'done'        // Fully complete — redirect to debrief
  | 'error'       // Something went wrong

export interface UseInterviewReturn {
  // State
  interviewState: InterviewState
  messages: Message[]
  currentResponse: InterviewerResponse | null
  questionNumber: number
  error: string | null
  sessionId: string | null
  interviewStartTime: number | null

  // Actions
  startInterview: (session: InterviewSession) => Promise<void>
  submitAnswer: (transcript: string) => Promise<void>
  setListening: () => void        // Call after TTS finishes speaking — triggers listening state
  forceEnd: () => Promise<void>   // Emergency end or manual end button
  retryLastCall: () => Promise<void>
  triggerWrapUp: () => Promise<void>  // Called when session enters wrap-up window
  triggerTimeUp: () => Promise<void>  // Called when configured duration elapses
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useInterview(): UseInterviewReturn {
  const [interviewState, setInterviewState] = useState<InterviewState>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentResponse, setCurrentResponse] = useState<InterviewerResponse | null>(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [interviewStartTime, setInterviewStartTime] = useState<number | null>(null)

  // Refs for values we need in async callbacks without stale closures
  const sessionRef = useRef<InterviewSession | null>(null)
  const systemPromptRef = useRef<string>('')
  const historyRef = useRef<GeminiTurn[]>([])
  const lastUserMessageRef = useRef<string>('')
  const startTimeRef = useRef<number>(Date.now())
  const followupCountRef = useRef(0)
  const wrapUpTriggeredRef = useRef(false)
  const wrapUpCompletedRef = useRef(false)
  const pendingWrapUpRef = useRef(false)
  const pendingTimeUpRef = useRef(false)
  const timeUpHandledRef = useRef(false)

  const getTiming = useCallback(() => {
    const durationSec = (sessionRef.current?.config.durationMinutes ?? 30) * 60
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
    const remaining = Math.max(durationSec - elapsed, 0)
    return { elapsed, remaining, durationSec }
  }, [])

  const buildTurnContext = useCallback((): string => {
    return `[Pacing: follow-ups on current question: ${followupCountRef.current}/${MAX_FOLLOWUPS_PER_QUESTION}. Do not mention time in your spoken message.]`
  }, [])

  const systemRequestedWrapUp = useCallback(
    (userMessage: string) =>
      userMessage.startsWith('[SYSTEM:') &&
      /wrap up|wrap_up|time is up/i.test(userMessage),
    [],
  )

  const applyFollowupCount = useCallback((response: InterviewerResponse) => {
    if (response.action === 'ask_followup') {
      followupCountRef.current += 1
    } else if (response.action === 'next_question') {
      followupCountRef.current = 0
    }
  }, [])

  // ── Internal: add message to state + history ─────────────────────────────
  const addMessage = useCallback((role: 'interviewer' | 'candidate', content: string) => {
    const msg: Message = { role, content, timestamp: Date.now() }

    setMessages(prev => {
      const updated = [...prev, msg]
      // Persist to localStorage on every new message
      if (sessionRef.current) {
        const updatedSession = { ...sessionRef.current, messages: updated }
        sessionRef.current = updatedSession
        saveSession(updatedSession)
      }
      return updated
    })

    historyRef.current = [...historyRef.current, { role, content }]
    return msg
  }, [])

  // ── Internal: enforce follow-up cap (re-call if model ignores limit) ─────
  const enforceFollowupCap = useCallback(
    async (response: InterviewerResponse): Promise<InterviewerResponse> => {
      if (response.action !== 'ask_followup' || followupCountRef.current < MAX_FOLLOWUPS_PER_QUESTION) {
        return response
      }

      const forced = await callGemini(
        systemPromptRef.current,
        historyRef.current,
        '[SYSTEM: You have already asked 2 follow-ups on this question. You MUST use action "next_question" and ask a new main interview question. Transition naturally — do not mention time, pacing, or running short on time in your spoken message.]',
      )

      if (forced.ok) {
        return forced.response
      }

      return {
        ...response,
        action: 'next_question',
        followup_count: 0,
        question_number: response.question_number + 1,
      }
    },
    [],
  )

  const blockEarlyWrapUp = useCallback(
    async (response: InterviewerResponse, userMessage: string): Promise<InterviewerResponse> => {
      if (response.action !== 'wrap_up') return response
      if (systemRequestedWrapUp(userMessage)) return response

      const durationMinutes = sessionRef.current?.config.durationMinutes ?? 30
      const { remaining } = getTiming()
      if (isInWrapUpWindow(remaining, durationMinutes)) return response

      const forced = await callGemini(
        systemPromptRef.current,
        historyRef.current,
        '[SYSTEM: It is not time to wrap up yet. Continue the interview with action "next_question" — ask a new main question. Do not mention time or pacing in your spoken message.]',
      )

      if (forced.ok) return forced.response

      return { ...response, action: 'next_question' }
    },
    [getTiming, systemRequestedWrapUp],
  )

  // ── Internal: call Gemini and handle the response ────────────────────────
  const callAndProcess = useCallback(
    async (userMessage: string, options?: { skipContext?: boolean }): Promise<void> => {
      setInterviewState('thinking')
      setError(null)
      lastUserMessageRef.current = userMessage

      const messageForGemini =
        options?.skipContext || userMessage === 'START_INTERVIEW'
          ? userMessage
          : `${buildTurnContext()}\n\n${userMessage}`

      const result = await callGemini(
        systemPromptRef.current,
        historyRef.current,
        messageForGemini,
      )

      if (!result.ok) {
        setError(result.error)
        setInterviewState('error')
        return
      }

      let response = await enforceFollowupCap(result.response)
      response = await blockEarlyWrapUp(response, userMessage)
      applyFollowupCount(response)

      if (response.action === 'wrap_up') {
        wrapUpCompletedRef.current = true
      }

      // Record interviewer message
      addMessage('interviewer', response.message)
      setCurrentResponse(response)
      setQuestionNumber(response.question_number)
      setInterviewState('responding')
    },
    [addMessage, applyFollowupCount, blockEarlyWrapUp, buildTurnContext, enforceFollowupCap],
  )

  // ── startInterview ────────────────────────────────────────────────────────
  const startInterview = useCallback(
    async (session: InterviewSession) => {
      sessionRef.current = session
      systemPromptRef.current = buildSystemPrompt(session.config)
      historyRef.current = []
      const startedAt = Date.now()
      startTimeRef.current = startedAt
      setInterviewStartTime(startedAt)
      followupCountRef.current = 0
      wrapUpTriggeredRef.current = false
      wrapUpCompletedRef.current = false
      pendingWrapUpRef.current = false
      pendingTimeUpRef.current = false
      timeUpHandledRef.current = false
      setSessionId(session.id)
      setMessages([])
      setQuestionNumber(1)
      setError(null)

      // "START_INTERVIEW" triggers the opening intro + first question
      await callAndProcess('START_INTERVIEW', { skipContext: true })
    },
    [callAndProcess],
  )

  // ── submitAnswer ──────────────────────────────────────────────────────────
  const submitAnswer = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return
      if (interviewState !== 'listening') return

      setInterviewState('thinking')
      addMessage('candidate', transcript.trim())
      await callAndProcess(transcript.trim())
    },
    [interviewState, addMessage, callAndProcess],
  )

  const triggerWrapUpInternal = useCallback(async () => {
    if (wrapUpTriggeredRef.current) return
    wrapUpTriggeredRef.current = true

    const { remaining } = getTiming()
    const mins = Math.max(1, Math.ceil(remaining / 60))

    await callAndProcess(
      `[SYSTEM: Approximately ${mins} minute(s) remain in this session. Wrap up now: use action "wrap_up". Thank the candidate, give a brief genuine impression, and say next steps are TBD. Do not ask new interview questions.]`,
      { skipContext: true },
    )
  }, [callAndProcess, getTiming])

  const triggerWrapUp = useCallback(async () => {
    if (wrapUpTriggeredRef.current) return

    if (interviewState !== 'listening') {
      pendingWrapUpRef.current = true
      return
    }

    await triggerWrapUpInternal()
  }, [interviewState, triggerWrapUpInternal])

  const triggerTimeUpInternal = useCallback(async () => {
    if (timeUpHandledRef.current) return
    timeUpHandledRef.current = true

    if (!wrapUpTriggeredRef.current) {
      wrapUpTriggeredRef.current = true
      await callAndProcess(
        '[SYSTEM: Time is up. Use action "wrap_up" immediately. Thank the candidate, brief impression, next steps TBD. No new questions.]',
        { skipContext: true },
      )
      return
    }

    if (!wrapUpCompletedRef.current) {
      pendingTimeUpRef.current = true
      timeUpHandledRef.current = false
      return
    }

    await callAndProcess(
      '[SYSTEM: Time is up. Respond with action "end" now — brief closing only.]',
      { skipContext: true },
    )
  }, [callAndProcess])

  const triggerTimeUp = useCallback(async () => {
    if (timeUpHandledRef.current) return

    if (interviewState !== 'listening') {
      pendingTimeUpRef.current = true
      return
    }

    await triggerTimeUpInternal()
  }, [interviewState, triggerTimeUpInternal])

  // ── Auto wrap-up / time-up (uses interview clock only, not page load time) ─
  useEffect(() => {
    if (!interviewStartTime || !sessionRef.current) return

    const durationMinutes = sessionRef.current.config.durationMinutes
    const wrapUpSecs = wrapUpThresholdSeconds(durationMinutes)

    const id = setInterval(() => {
      const state = interviewState
      if (state === 'done' || state === 'scoring' || state === 'idle' || state === 'error') return

      const { remaining } = getTiming()

      if (remaining <= wrapUpSecs && remaining > 0) {
        void triggerWrapUp()
      } else if (remaining <= 0) {
        void triggerTimeUp()
      }
    }, 1000)

    return () => clearInterval(id)
  }, [interviewStartTime, interviewState, getTiming, triggerTimeUp, triggerWrapUp])

  // ── setListening ──────────────────────────────────────────────────────────
  // Called by InterviewPage after TTS finishes speaking the interviewer message
  const setListening = useCallback(() => {
    if (!currentResponse) return

    if (currentResponse.action === 'end') {
      handleEndOfInterview()
      return
    }

    if (currentResponse.action === 'wrap_up') {
      void callAndProcess(
        '[SYSTEM: Wrap-up delivered. Respond with action "end" only — a brief closing sentence. No new questions.]',
        { skipContext: true },
      )
      return
    }

    setInterviewState('listening')

    if (pendingWrapUpRef.current) {
      pendingWrapUpRef.current = false
      void triggerWrapUpInternal()
    } else if (pendingTimeUpRef.current) {
      pendingTimeUpRef.current = false
      void triggerTimeUpInternal()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentResponse, callAndProcess, triggerWrapUpInternal, triggerTimeUpInternal])

  // ── handleEndOfInterview ──────────────────────────────────────────────────
  const handleEndOfInterview = useCallback(async () => {
    if (!sessionRef.current) return

    setInterviewState('scoring')

    // Update session end time
    const endedSession = { ...sessionRef.current, endedAt: Date.now() }
    sessionRef.current = endedSession
    saveSession(endedSession)

    // Generate debrief score (runs in background — graceful if it fails)
    const score = await scoreInterview(
      {
        role: sessionRef.current.config.role,
        interviewType: sessionRef.current.config.interviewType,
        difficulty: sessionRef.current.config.difficulty,
      },
      historyRef.current,
    )

    if (score && sessionRef.current) {
      const scoredSession = { ...sessionRef.current, score }
      sessionRef.current = scoredSession
      saveSession(scoredSession)
    }

    setInterviewState('done')
  }, [])

  // ── forceEnd ──────────────────────────────────────────────────────────────
  const forceEnd = useCallback(async () => {
    await handleEndOfInterview()
  }, [handleEndOfInterview])

  // ── retryLastCall ─────────────────────────────────────────────────────────
  const retryLastCall = useCallback(async () => {
    if (lastUserMessageRef.current) {
      // Remove the last interviewer message if it was partial
      setMessages(prev => prev.filter((_, i) => i < prev.length - 1))
      historyRef.current = historyRef.current.slice(0, -1)
      await callAndProcess(lastUserMessageRef.current)
    }
  }, [callAndProcess])

  return {
    interviewState,
    messages,
    currentResponse,
    questionNumber,
    error,
    sessionId,
    interviewStartTime,
    startInterview,
    submitAnswer,
    setListening,
    forceEnd,
    retryLastCall,
    triggerWrapUp,
    triggerTimeUp,
  }
}
