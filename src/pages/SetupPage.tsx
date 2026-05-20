import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InterviewType, Difficulty, SessionConfig } from '../types'
import { interviewTypeLabel, difficultyLabel, generateId, saveSession } from '../utils'

const INTERVIEW_TYPES: InterviewType[] = ['behavioral', 'technical', 'system-design', 'hr']
const DIFFICULTIES: Difficulty[] = ['junior', 'mid', 'senior', 'staff']
const DURATIONS = [15, 30, 45, 60]

const TYPE_DESCRIPTIONS: Record<InterviewType, string> = {
  behavioral: 'STAR-format questions about past experience and situations',
  technical: 'Coding, algorithms, and technical concept questions',
  'system-design': 'Design scalable systems and discuss architecture trade-offs',
  hr: 'Culture fit, motivation, and career goals conversation',
}

export default function SetupPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState('')
  const [interviewType, setInterviewType] = useState<InterviewType>('behavioral')
  const [difficulty, setDifficulty] = useState<Difficulty>('mid')
  const [duration, setDuration] = useState(30)

  function handleStart() {
    if (!role.trim()) return

    const config: SessionConfig = {
      role: role.trim(),
      interviewType,
      difficulty,
      durationMinutes: duration,
    }

    const session = {
      id: generateId(),
      config,
      messages: [],
      startedAt: Date.now(),
    }

    saveSession(session)

    navigate('/interview', { state: { session } })
  }

  const canStart = role.trim().length > 0

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
            <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Mock Interviewer</h1>
          <p className="text-gray-400 mt-1 text-sm">Voice-first. Real follow-ups. Honest feedback.</p>
        </div>

        <div className="space-y-6">

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Role you're interviewing for
            </label>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStart()}
              placeholder="e.g. Senior Software Engineer, Product Manager..."
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors text-sm"
            />
          </div>

          {/* Interview Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Interview type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {INTERVIEW_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => setInterviewType(type)}
                  className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    interviewType === type
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium">{interviewTypeLabel(type)}</div>
                  <div className="text-xs mt-0.5 text-gray-500 leading-tight">
                    {TYPE_DESCRIPTIONS[type]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Difficulty level
            </label>
            <div className="grid grid-cols-4 gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2 rounded-xl border text-sm font-medium transition-all ${
                    difficulty === d
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {difficultyLabel(d).split(' ')[0]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              {difficulty === 'junior' && 'Foundational questions, focus on potential and basics'}
              {difficulty === 'mid' && '2–5 years experience, solid fundamentals expected'}
              {difficulty === 'senior' && 'Deep expertise, leadership and ambiguity expected'}
              {difficulty === 'staff' && 'Org-wide impact, architecture and strategy focus'}
            </p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Session duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`py-2 rounded-xl border text-sm font-medium transition-all ${
                    duration === d
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!canStart}
            className={`w-full py-3.5 rounded-xl font-medium text-sm transition-all ${
              canStart
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            Start Interview
          </button>

        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-700 mt-6">
          Microphone access required · Powered by Gemini + Kokoro TTS
        </p>

      </div>
    </div>
  )
}
