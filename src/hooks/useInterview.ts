import { useCallback, useRef, useState } from 'react'
import { buildSystemPrompt } from '../prompts/systemPrompt'
import { callGemini, scoreInterview, type GeminiTurn, type InterviewerResponse } from '../services/gemini'
import type { InterviewSession, Message } from '../types'
import { saveSession } from '../utils'

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

  // Actions
  startInterview: (session: InterviewSession) => Promise<void>
  submitAnswer: (transcript: string) => Promise<void>
  setListening: () => void        // Call after TTS finishes speaking — triggers listening state
  forceEnd: () => Promise<void>   // Emergency end or manual end button
  retryLastCall: () => Promise<void>
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useInterview(): UseInterviewReturn {
  const [interviewState, setInterviewState] = useState<InterviewState>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentResponse, setCurrentResponse] = useState<InterviewerResponse | null>(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Refs for values we need in async callbacks without stale closures
  const sessionRef = useRef<InterviewSession | null>(null)
  const systemPromptRef = useRef<string>('')
  const historyRef = useRef<GeminiTurn[]>([])
  const lastUserMessageRef = useRef<string>('')

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

  // ── Internal: call Gemini and handle the response ────────────────────────
  const callAndProcess = useCallback(
    async (userMessage: string): Promise<void> => {
      setInterviewState('thinking')
      setError(null)
      lastUserMessageRef.current = userMessage

      const result = await callGemini(
        systemPromptRef.current,
        historyRef.current,
        userMessage,
      )

      if (!result.ok) {
        setError(result.error)
        setInterviewState('error')
        return
      }

      const response = result.response

      // Record interviewer message
      addMessage('interviewer', response.message)
      setCurrentResponse(response)
      setQuestionNumber(response.question_number)

      // State after Gemini responds: 'responding' — caller (InterviewPage) will
      // call voice.interviewerSpeak(), then call setListening() when done
      if (response.action === 'end') {
        setInterviewState('responding') // Will transition to 'done' after TTS
      } else {
        setInterviewState('responding')
      }
    },
    [addMessage],
  )

  // ── startInterview ────────────────────────────────────────────────────────
  const startInterview = useCallback(
    async (session: InterviewSession) => {
      sessionRef.current = session
      systemPromptRef.current = buildSystemPrompt(session.config)
      historyRef.current = []
      setSessionId(session.id)
      setMessages([])
      setQuestionNumber(1)
      setError(null)

      // "START_INTERVIEW" triggers the opening intro + first question
      await callAndProcess('START_INTERVIEW')
    },
    [callAndProcess],
  )

  // ── submitAnswer ──────────────────────────────────────────────────────────
  const submitAnswer = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return
      if (interviewState !== 'listening') return

      // Record candidate's answer
      addMessage('candidate', transcript.trim())

      // Send to Gemini for evaluation + next action
      await callAndProcess(transcript.trim())
    },
    [interviewState, addMessage, callAndProcess],
  )

  // ── setListening ──────────────────────────────────────────────────────────
  // Called by InterviewPage after TTS finishes speaking the interviewer message
  const setListening = useCallback(() => {
    if (!currentResponse) return

    if (currentResponse.action === 'end') {
      // After speaking the wrap-up, move to scoring
      handleEndOfInterview()
    } else {
      setInterviewState('listening')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentResponse])

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
    startInterview,
    submitAnswer,
    setListening,
    forceEnd,
    retryLastCall,
  }
}
