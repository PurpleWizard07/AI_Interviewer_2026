import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useInterview } from '../hooks/useInterview'
import { useVoice } from '../hooks/useVoice'
import type { InterviewSession } from '../types'
import { getInterviewerPersona, interviewTypeLabel, difficultyLabel } from '../utils'
import { PERSONA_VOICES } from '../hooks/useTTS'
import type { KokoroVoice } from '../hooks/useTTS'
import { InterviewerCard } from '../components/ui/InterviewerCard'
import { MicButton } from '../components/ui/MicButton'
import { TranscriptPanel } from '../components/ui/TranscriptPanel'
import { TimerRing } from '../components/ui/TimerRing'
import { STT_SILENCE_SUBMIT_MS } from '../hooks/useSTT'

export default function InterviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = location.state?.session as InterviewSession | undefined

  const prepareSpeechRef = useRef<(message: string) => void>(() => {})

  const interview = useInterview({
    onResponseReady: (message) => prepareSpeechRef.current(message),
  })
  const [elapsed, setElapsed] = useState(0)
  const [textInput, setTextInput] = useState('')
  const [showText, setShowText] = useState(false)
  const hasStartedRef = useRef(false)
  const onAnswerRef = useRef<(transcript: string) => void>(() => {})

  const persona = session ? getInterviewerPersona(session.config.interviewType) : null
  const interviewerVoice = persona
    ? (PERSONA_VOICES[persona.name] as KokoroVoice) ?? 'af_heart'
    : 'af_heart'

  const voice = useVoice({
    interviewerVoice,
    onUserSpeechEnd: (transcript) => onAnswerRef.current(transcript),
  })

  prepareSpeechRef.current = (message) => {
    void voice.prepareInterviewerSpeech(message)
  }

  onAnswerRef.current = (transcript) => {
    void interview.submitAnswer(transcript)
  }

  // ── Guards ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) navigate('/')
  }, [session, navigate])

  // ── Init: load TTS + start interview ────────────────────────────────────
  useEffect(() => {
    if (!session || hasStartedRef.current) return
    hasStartedRef.current = true
    async function init() {
      await voice.load()
      await interview.startInterview(session!)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Elapsed timer (synced to when interview actually starts, after voice load) ─
  useEffect(() => {
    if (!interview.interviewStartTime) return
    const start = interview.interviewStartTime
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [interview.interviewStartTime])

  // ── Play prepared speech → then listen ───────────────────────────────────
  useEffect(() => {
    if (interview.interviewState !== 'responding' || !interview.currentResponse) return
    const message = interview.currentResponse.message
    async function go() {
      try {
        await voice.interviewerSpeak(message, {
          onSpeechStart: () => interview.commitInterviewerMessage(),
        })
      } finally {
        interview.commitInterviewerMessage()
        interview.setListening()
      }
    }
    go()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.interviewState, interview.currentResponse?.message])

  // ── Mic only while candidate's turn ─────────────────────────────────────
  useEffect(() => {
    if (interview.interviewState === 'listening') {
      voice.startListening()
    } else {
      voice.stopListening()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.interviewState])

  // ── Navigate to debrief when done ────────────────────────────────────────
  useEffect(() => {
    if (interview.interviewState === 'done' && interview.sessionId) {
      navigate(`/debrief/${interview.sessionId}`)
    }
  }, [interview.interviewState, interview.sessionId, navigate])

  if (!session || !persona) return null

  const total = session.config.durationMinutes * 60
  const isInitializing = interview.interviewState === 'idle' || (voice.isLoading && interview.messages.length === 0)
  const isThinking = interview.interviewState === 'thinking'
  const isConsideringAnswer =
    isThinking && interview.messages.at(-1)?.role === 'candidate'
  const silenceSubmitSec = Math.round(STT_SILENCE_SUBMIT_MS / 1000)
  const isPreparingVoice = voice.isGenerating
  const isSpeaking = voice.isSpeaking
  const isVoiceActive = isPreparingVoice || isSpeaking
  const isListening = interview.interviewState === 'listening'
  const isScoring = interview.interviewState === 'scoring'
  const isBusy = isThinking || isVoiceActive || isScoring || isInitializing
  const pendingInterviewerSpeech =
    interview.interviewState === 'responding' && !interview.interviewerMessageCommitted

  function handleMicClick() {
    if (voice.isListening) {
      voice.stopListening()
    } else if (isListening) {
      voice.startListening()
    }
  }

  function handleTextSubmit() {
    if (!textInput.trim()) return
    void interview.submitAnswer(textInput.trim())
    setTextInput('')
    setShowText(false)
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 border-b border-gray-800/60 px-4 py-2.5 flex items-center gap-3">
        {/* Back */}
        <button
          onClick={() => { if (confirm('End interview and go back?')) interview.forceEnd() }}
          className="text-gray-600 hover:text-gray-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Session info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-300 truncate">{session.config.role}</p>
          <p className="text-[11px] text-gray-600">
            {interviewTypeLabel(session.config.interviewType)} · {difficultyLabel(session.config.difficulty)}
          </p>
        </div>

        {/* Question tracker */}
        {interview.questionNumber > 0 && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(interview.questionNumber + 1, 6) }).map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i < interview.questionNumber
                    ? 'w-4 bg-indigo-500'
                    : i === interview.questionNumber - 1
                    ? 'w-4 bg-indigo-400'
                    : 'w-2 bg-gray-700'
                }`}
              />
            ))}
          </div>
        )}

        {/* Timer ring */}
        <TimerRing elapsed={elapsed} total={total} size={56} strokeWidth={4} />
      </div>

      {/* ── Main layout: left panel (interviewer) + right panel (transcript) ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: Interviewer panel ── */}
        <div className="w-64 flex-shrink-0 border-r border-gray-800/60 flex flex-col items-center justify-between py-6 px-4">

          <div className="flex-1 flex flex-col items-center justify-center w-full">
            {/* Initializing overlay */}
            {isInitializing ? (
              <div className="text-center space-y-4">
                {voice.isLoading ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto">
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm text-gray-300 font-medium">Loading voice…</p>
                      <div className="w-32 h-1 bg-gray-800 rounded-full overflow-hidden mx-auto">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                          style={{ width: `${voice.loadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">{voice.loadProgress}% — cached after this</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto">
                      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    <p className="text-sm text-gray-400">Preparing interview…</p>
                  </>
                )}
              </div>
            ) : (
              <InterviewerCard
                name={persona.name}
                title={persona.title}
                isSpeaking={isVoiceActive}
                isThinking={isThinking && !isVoiceActive}
                isConsideringAnswer={isConsideringAnswer}
                isListening={voice.isListening}
              />
            )}
          </div>

          {/* End button */}
          <button
            onClick={() => { if (confirm('End this interview session?')) interview.forceEnd() }}
            className="text-xs text-gray-700 hover:text-gray-500 transition-colors border border-gray-800 hover:border-gray-700 rounded-lg px-3 py-1.5"
          >
            End interview
          </button>
        </div>

        {/* ── Right: Transcript ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TranscriptPanel
            messages={interview.messages}
            interviewerName={persona.name}
            isThinking={isThinking}
            isConsideringAnswer={isConsideringAnswer}
            pendingInterviewerSpeech={pendingInterviewerSpeech}
            isPreparingVoice={isPreparingVoice}
            isInterviewerSpeaking={isSpeaking}
            interimTranscript={voice.interimTranscript}
            liveTranscript={voice.transcript}
            isListening={voice.isListening}
          />

          {/* ── Bottom controls ── */}
          <div className="flex-shrink-0 border-t border-gray-800/60 px-4 py-4 space-y-3">

            {/* Scoring state */}
            {isScoring && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Generating your debrief…
              </div>
            )}

            {/* Main mic row */}
            {!isScoring && (
              <div className="flex items-center gap-4">
                <MicButton
                  isListening={voice.isListening}
                  isBusy={isBusy}
                  isDisabled={isBusy}
                  onClick={handleMicClick}
                />

                <div className="flex-1">
                  {/* State label */}
                  <p className={`text-sm font-medium ${
                    voice.isListening ? 'text-red-400' :
                    isPreparingVoice ? 'text-violet-400' :
                    isSpeaking ? 'text-indigo-400' :
                    isThinking ? 'text-amber-400' :
                    isListening ? 'text-gray-300' :
                    'text-gray-600'
                  }`}>
                    {voice.isListening
                      ? 'Listening — tap mic when done'
                      : isPreparingVoice
                      ? `${persona.name} is preparing to speak…`
                      : isSpeaking
                      ? `${persona.name} is speaking…`
                      : isThinking
                      ? isConsideringAnswer
                        ? `${persona.name} is considering your answer…`
                        : `${persona.name} is preparing the next question…`
                      : isListening
                      ? 'Your turn — tap mic to speak'
                      : isInitializing
                      ? 'Starting…'
                      : 'Waiting…'}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {isListening && !voice.isListening
                      ? 'Or type your answer below'
                      : voice.isListening
                      ? `Auto-submits after ~${silenceSubmitSec}s of silence, or tap mic`
                      : `Q${interview.questionNumber} · ${session.config.durationMinutes} min session`}
                  </p>
                </div>

                {/* Type toggle */}
                {isListening && (
                  <button
                    onClick={() => setShowText(s => !s)}
                    className="text-xs text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-700 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    {showText ? 'Hide' : 'Type'}
                  </button>
                )}
              </div>
            )}

            {/* Text input fallback */}
            {showText && isListening && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  autoFocus
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  placeholder="Type your answer…"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm text-white font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            )}

            {/* Error */}
            {interview.error && (
              <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                <p className="text-red-400 text-xs">{interview.error}</p>
                <button
                  onClick={() => interview.retryLastCall()}
                  className="text-xs text-red-400 hover:text-red-300 underline ml-3 flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
