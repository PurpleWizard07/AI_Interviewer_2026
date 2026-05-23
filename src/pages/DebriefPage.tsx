import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { InterviewSession, QuestionScore } from '../types'
import { loadSessions, interviewTypeLabel, difficultyLabel, getInterviewerPersona } from '../utils'
import { ScoreRing, ScoreBar, scoreColor, scoreLabel } from '../components/ui/ScoreRing'

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function durationLabel(start: number, end?: number) {
  if (!end) return '—'
  const secs = Math.floor((end - start) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s}s`
}

export default function DebriefPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [pollCount, setPollCount] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'transcript'>('overview')

  useEffect(() => {
    function load() {
      const sessions = loadSessions()
      const found = sessions.find(s => s.id === sessionId)
      if (found) {
        setSession(found)
        if (found.score && pollRef.current) clearInterval(pollRef.current)
      }
    }
    load()
    pollRef.current = setInterval(() => { setPollCount(c => c + 1); load() }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId])

  // suppress pollCount lint
  useEffect(() => {}, [pollCount])

  useEffect(() => {
    if (pollCount > 15 && !session) navigate('/')
  }, [pollCount, session, navigate])

  if (!session) return <LoadingScreen message="Loading session…" />
  const { config, score } = session
  const persona = getInterviewerPersona(config.interviewType)

  if (!score) return <LoadingScreen message="Generating your debrief report…" subtitle="Analysing responses and building feedback" />

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 font-medium">Interview Complete</span>
              <span className="text-xs text-gray-600">{formatDate(session.startedAt)}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{config.role}</h1>
            <p className="text-gray-400 text-sm mt-1">
              {interviewTypeLabel(config.interviewType)} · {difficultyLabel(config.difficulty)} · {durationLabel(session.startedAt, session.endedAt)}
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex-shrink-0 text-xs px-3 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
          >New interview</button>
        </div>

        {/* Overall score hero */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center gap-6">
          <ScoreRing score={score.overall} size={100} strokeWidth={7} />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{ color: scoreColor(score.overall) }}>
                {scoreLabel(score.overall)}
              </span>
              <span className="text-gray-600 text-sm">overall</span>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed">{score.summary}</p>
            <p className="text-xs text-gray-600">Evaluated by {persona.name}, {persona.title}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 p-1 rounded-xl">
          {(['overview', 'questions', 'transcript'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all ${activeTab === tab ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab score={score} />}
        {activeTab === 'questions' && <QuestionsTab questionScores={score.questionScores} />}
        {activeTab === 'transcript' && <TranscriptTab session={session} />}

        <PastSessions currentId={session.id} />
      </div>
    </div>
  )
}

function OverviewTab({ score }: { score: NonNullable<InterviewSession['score']> }) {
  const dims = ['communication', 'depth', 'structure', 'relevance'] as const
  const avgDims = dims.map(dim => ({
    label: dim.charAt(0).toUpperCase() + dim.slice(1),
    score: score.questionScores.length
      ? parseFloat((score.questionScores.reduce((a, q) => a + q[dim], 0) / score.questionScores.length).toFixed(1))
      : 0,
  }))

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300">Performance breakdown</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {avgDims.map(({ label, score: s }) => <ScoreBar key={label} label={label} score={s} />)}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Strengths
        </h2>
        <ul className="space-y-2.5">
          {score.strengths.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-gray-300">
              <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          Areas to improve
        </h2>
        <ul className="space-y-2.5">
          {score.gaps.map((g, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-gray-300">
              <span className="text-amber-500 mt-0.5 flex-shrink-0">→</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function QuestionsTab({ questionScores }: { questionScores: QuestionScore[] }) {
  const [expanded, setExpanded] = useState<number | null>(0)

  if (!questionScores.length)
    return <p className="text-gray-600 text-sm text-center py-8">No per-question scores available.</p>

  return (
    <div className="space-y-3">
      {questionScores.map((q, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-800/50 transition-colors"
          >
            <ScoreRing score={q.overall} size={44} strokeWidth={4} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">Question {i + 1}</p>
              <p className="text-sm text-gray-200 line-clamp-2 leading-snug">{q.question}</p>
            </div>
            <svg className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform ${expanded === i ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded === i && (
            <div className="px-4 pb-4 border-t border-gray-800 space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-4">
                <ScoreBar label="Communication" score={q.communication} />
                <ScoreBar label="Depth" score={q.depth} />
                <ScoreBar label="Structure" score={q.structure} />
                <ScoreBar label="Relevance" score={q.relevance} />
              </div>
              <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                <p className="text-xs text-gray-500 mb-1">Feedback</p>
                <p className="text-sm text-gray-300 leading-relaxed">{q.feedback}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TranscriptTab({ session }: { session: InterviewSession }) {
  const persona = getInterviewerPersona(session.config.interviewType)
  if (!session.messages.length)
    return <p className="text-gray-600 text-sm text-center py-8">No transcript recorded.</p>

  return (
    <div className="space-y-3 pb-2">
      {session.messages.map((msg, i) => {
        const isInterviewer = msg.role === 'interviewer'
        return (
          <div key={i} className={`flex gap-2.5 ${isInterviewer ? '' : 'flex-row-reverse'}`}>
            <div className={`w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-semibold ${isInterviewer ? 'bg-gray-700 text-gray-300' : 'bg-indigo-600 text-white'}`}>
              {isInterviewer ? persona.name.split(' ').map(n => n[0]).join('') : 'You'}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${isInterviewer ? 'bg-gray-900 border border-gray-800 text-gray-200 rounded-tl-sm' : 'bg-indigo-600/20 border border-indigo-500/20 text-indigo-100 rounded-tr-sm'}`}>
              {msg.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PastSessions({ currentId }: { currentId: string }) {
  const navigate = useNavigate()
  const past = loadSessions().filter(s => s.id !== currentId && s.score)
  if (!past.length) return null

  return (
    <div className="space-y-3 pb-8">
      <h2 className="text-sm font-semibold text-gray-500">Past sessions</h2>
      <div className="space-y-2">
        {past.slice(0, 5).map(s => (
          <button key={s.id} onClick={() => navigate(`/debrief/${s.id}`)}
            className="w-full bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-3.5 flex items-center gap-3 text-left transition-colors">
            {s.score && <ScoreRing score={s.score.overall} size={40} strokeWidth={3} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{s.config.role}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {interviewTypeLabel(s.config.interviewType)} · {difficultyLabel(s.config.difficulty)} · {formatDate(s.startedAt)}
              </p>
            </div>
            <svg className="w-4 h-4 text-gray-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

function LoadingScreen({ message, subtitle }: { message: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="w-16 h-16 rounded-full border-2 border-gray-800" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-indigo-400 animate-spin"
            style={{ animationDelay: '0.15s', animationDuration: '0.9s' }} />
        </div>
        <div>
          <p className="text-white font-medium">{message}</p>
          {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
