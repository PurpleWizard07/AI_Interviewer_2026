import type { InterviewType, Difficulty } from '../types'

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function interviewTypeLabel(type: InterviewType): string {
  const labels: Record<InterviewType, string> = {
    behavioral: 'Behavioral',
    technical: 'Technical',
    'system-design': 'System Design',
    hr: 'HR / Culture',
  }
  return labels[type]
}

export function difficultyLabel(d: Difficulty): string {
  const labels: Record<Difficulty, string> = {
    junior: 'Junior',
    mid: 'Mid-level',
    senior: 'Senior',
    staff: 'Staff / Principal',
  }
  return labels[d]
}

export function getInterviewerPersona(type: InterviewType): { name: string; title: string } {
  const personas: Record<InterviewType, { name: string; title: string }> = {
    behavioral: { name: 'Sarah Chen', title: 'Engineering Manager' },
    technical: { name: 'Arjun Mehta', title: 'Senior Software Engineer' },
    'system-design': { name: 'Priya Nair', title: 'Staff Engineer' },
    hr: { name: 'James Okafor', title: 'Talent Partner' },
  }
  return personas[type]
}

export function loadSessions(): import('../types').InterviewSession[] {
  try {
    const raw = localStorage.getItem('interview_sessions')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveSession(session: import('../types').InterviewSession): void {
  const sessions = loadSessions()
  const existing = sessions.findIndex(s => s.id === session.id)
  if (existing >= 0) {
    sessions[existing] = session
  } else {
    sessions.unshift(session)
  }
  // Keep only last 20 sessions
  localStorage.setItem('interview_sessions', JSON.stringify(sessions.slice(0, 20)))
}
