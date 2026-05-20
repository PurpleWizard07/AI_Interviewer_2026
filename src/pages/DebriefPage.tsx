import { useNavigate } from 'react-router-dom'

export default function DebriefPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl text-center space-y-4">

        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20">
          <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold">Interview Complete</h2>
        <p className="text-gray-400 text-sm">Detailed scoring and feedback report coming in Phase 5.</p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-500 text-sm">
            Debrief will include: overall score, per-question rubric, strengths, gaps, and actionable advice.
          </p>
        </div>

        <button
          onClick={() => navigate('/')}
          className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 px-6 rounded-xl transition-colors"
        >
          New Interview
        </button>

      </div>
    </div>
  )
}
