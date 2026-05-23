import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InterviewType, Difficulty, SessionConfig } from '../types'
import { interviewTypeLabel, difficultyLabel, generateId, saveSession, loadSessions, getInterviewerPersona } from '../utils'

const INTERVIEW_TYPES: InterviewType[] = ['behavioral', 'technical', 'system-design', 'hr']
const DIFFICULTIES: Difficulty[] = ['junior', 'mid', 'senior', 'staff']
const DURATIONS = [15, 30, 45, 60]

const TYPE_DESCRIPTIONS: Record<InterviewType, string> = {
  behavioral:      'STAR-format questions about past experience',
  technical:       'Coding, algorithms, and concepts',
  'system-design': 'Design scalable systems and architectures',
  hr:              'Culture fit, motivation, and career goals',
}

const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  junior: 'Foundational knowledge, learning potential',
  mid:    '2–5 years, production experience expected',
  senior: '5+ years, leadership and deep expertise',
  staff:  'Org-wide impact, architecture decisions',
}

// ── Browser compatibility check ──────────────────────────────────────────────
function getBrowserWarning(): string | null {
  if (typeof window === 'undefined') return null
  const isSpeechSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  if (!isSpeechSupported) return 'Web Speech API not supported. Use Chrome or Edge for voice features.'
  const isChromium = navigator.userAgent.includes('Chrome') || navigator.userAgent.includes('Edg')
  if (!isChromium) return 'Best experience on Chrome or Edge. Other browsers may have limited mic support.'
  return null
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? '#22c55e' : score >= 6 ? '#6366f1' : score >= 4 ? '#f59e0b' : '#ef4444'
  return (
    <span className="text-xs font-bold tabular-nums" style={{ color }}>
      {score.toFixed(1)}
    </span>
  )
}

export default function SetupPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState('')
  const [interviewType, setInterviewType] = useState<InterviewType>('behavioral')
  const [difficulty, setDifficulty] = useState<Difficulty>('mid')
  const [duration, setDuration] = useState(30)

  const browserWarning = getBrowserWarning()
  const pastSessions = loadSessions().filter(s => s.score).slice(0, 3)

  function handleStart() {
    if (!role.trim()) return
    const config: SessionConfig = { role: role.trim(), interviewType, difficulty, durationMinutes: duration }
    const session = { id: generateId(), config, messages: [], startedAt: Date.now() }
    saveSession(session)
    navigate('/interview', { state: { session } })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl py-8">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Mock Interviewer</h1>
          <p className="text-gray-500 mt-1 text-sm">Voice-first · Real follow-ups · Honest feedback</p>
        </div>

        {/* Browser warning */}
        {browserWarning && (
          <div className="mb-5 flex gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            <p className="text-amber-300 text-xs leading-relaxed">{browserWarning}</p>
          </div>
        )}

        <div className="space-y-5">

          {/* Role input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Role you're interviewing for</label>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder="e.g. Senior Software Engineer, Product Manager…"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-colors text-sm"
              autoFocus
            />
          </div>

          {/* Interview type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Interview type</label>
            <div className="grid grid-cols-2 gap-2">
              {INTERVIEW_TYPES.map(type => {
                const persona = getInterviewerPersona(type)
                return (
                  <button key={type} onClick={() => setInterviewType(type)}
                    className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${interviewType === type ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'}`}>
                    <div className="font-medium">{interviewTypeLabel(type)}</div>
                    <div className="text-xs mt-0.5 text-gray-500 leading-tight">{TYPE_DESCRIPTIONS[type]}</div>
                    {interviewType === type && (
                      <div className="text-xs mt-1.5 text-indigo-400/70">with {persona.name}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Difficulty level</label>
            <div className="grid grid-cols-4 gap-2">
              {DIFFICULTIES.map(d => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${difficulty === d ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'}`}>
                  {difficultyLabel(d).split(' ')[0]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1.5">{DIFFICULTY_HINTS[difficulty]}</p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Session duration</label>
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${duration === d ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'}`}>
                  {d} min
                </button>
              ))}
            </div>
          </div>

          {/* Start */}
          <button
            onClick={handleStart}
            disabled={!role.trim()}
            className={`w-full py-3.5 rounded-xl font-medium text-sm transition-all ${role.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-500/20' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
          >
            Start Interview
          </button>

        </div>

        {/* Past sessions */}
        {pastSessions.length > 0 && (
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800" />
              <p className="text-xs text-gray-600 flex-shrink-0">Recent sessions</p>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            <div className="space-y-2">
              {pastSessions.map(s => (
                <button key={s.id} onClick={() => navigate(`/debrief/${s.id}`)}
                  className="w-full bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 font-medium truncate">{s.config.role}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {interviewTypeLabel(s.config.interviewType)} · {difficultyLabel(s.config.difficulty)}
                    </p>
                  </div>
                  {s.score && <ScoreBadge score={s.score.overall} />}
                  <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-700 mt-6">
          Microphone required · Chrome or Edge · Powered by Gemini + Kokoro TTS
        </p>

      </div>
    </div>
  )
}
