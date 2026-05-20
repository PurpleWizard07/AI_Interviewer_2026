export type InterviewType = 'behavioral' | 'technical' | 'system-design' | 'hr'

export type Difficulty = 'junior' | 'mid' | 'senior' | 'staff'

export type SessionState =
  | 'idle'
  | 'intro'
  | 'questioning'
  | 'followup'
  | 'ending'
  | 'done'

export interface SessionConfig {
  role: string
  interviewType: InterviewType
  difficulty: Difficulty
  durationMinutes: number
}

export interface Message {
  role: 'interviewer' | 'candidate'
  content: string
  timestamp: number
}

export interface QuestionScore {
  question: string
  communication: number  // 0-10
  depth: number          // 0-10
  structure: number      // 0-10
  relevance: number      // 0-10
  overall: number        // 0-10
  feedback: string
}

export interface SessionScore {
  overall: number        // 0-10
  strengths: string[]
  gaps: string[]
  questionScores: QuestionScore[]
  summary: string
}

export interface InterviewSession {
  id: string
  config: SessionConfig
  messages: Message[]
  startedAt: number
  endedAt?: number
  score?: SessionScore
}
