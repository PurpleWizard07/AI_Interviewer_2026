import { useLocation, useNavigate } from 'react-router-dom'
import type { InterviewSession } from '../types'
import { interviewTypeLabel, difficultyLabel, getInterviewerPersona } from '../utils'

export default function InterviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = location.state?.session as InterviewSession | undefined

  if (!session) {
    navigate('/')
    return null
  }

  const { config } = session
  const persona = getInterviewerPersona(config.interviewType)

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl text-center space-y-6">

        {/* Interviewer avatar */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
          <span className="text-2xl font-semibold text-indigo-400">
            {persona.name.split(' ').map(n => n[0]).join('')}
          </span>
        </div>

        <div>
          <h2 className="text-xl font-semibold">{persona.name}</h2>
          <p className="text-gray-400 text-sm mt-0.5">{persona.title}</p>
        </div>

        {/* Session info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Role</span>
            <span className="text-gray-200">{config.role}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Type</span>
            <span className="text-gray-200">{interviewTypeLabel(config.interviewType)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Level</span>
            <span className="text-gray-200">{difficultyLabel(config.difficulty)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Duration</span>
            <span className="text-gray-200">{config.durationMinutes} minutes</span>
          </div>
        </div>

        {/* Phase 2/3/4 placeholder notice */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <p className="text-amber-400 text-sm font-medium">Voice pipeline coming in Phase 2</p>
          <p className="text-amber-400/60 text-xs mt-1">
            Kokoro TTS · Web Speech API · Gemini AI · Follow-up logic
          </p>
        </div>

        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back to setup
        </button>

      </div>
    </div>
  )
}
