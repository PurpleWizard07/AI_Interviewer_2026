import { Waveform } from './Waveform'

interface InterviewerCardProps {
  name: string
  title: string
  isSpeaking: boolean
  isThinking: boolean
  /** When true with isThinking, label reflects processing the candidate's answer. */
  isConsideringAnswer?: boolean
  isListening: boolean
}

const INITIALS_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  SC: { bg: '#1e3a5f', text: '#60a5fa', ring: '#3b82f6' },
  AM: { bg: '#2d1b4e', text: '#a78bfa', ring: '#8b5cf6' },
  PN: { bg: '#1a3a2e', text: '#34d399', ring: '#10b981' },
  JO: { bg: '#3b2000', text: '#fbbf24', ring: '#f59e0b' },
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('')
}

export function InterviewerCard({
  name,
  title,
  isSpeaking,
  isThinking,
  isConsideringAnswer = false,
  isListening,
}: InterviewerCardProps) {
  const initials = getInitials(name)
  const colors = INITIALS_COLORS[initials] ?? { bg: '#1e293b', text: '#94a3b8', ring: '#475569' }

  const waveMode = isSpeaking
    ? 'speaking'
    : isThinking
    ? 'thinking'
    : isListening
    ? 'listening'
    : 'idle'
  const waveColor = isSpeaking
    ? colors.ring
    : isThinking
    ? '#f59e0b'
    : isListening
    ? '#ef4444'
    : '#374151'

  const statusText = isSpeaking
    ? 'Speaking…'
    : isThinking
    ? isConsideringAnswer
      ? 'Considering your answer…'
      : 'Preparing next question…'
    : isListening
    ? 'Listening to you'
    : 'Ready'

  const statusColor = isSpeaking
    ? 'text-indigo-400'
    : isThinking
    ? 'text-amber-400'
    : isListening
    ? 'text-red-400'
    : 'text-gray-600'

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar with animated ring */}
      <div className="relative">
        {/* Outer glow ring when speaking */}
        {(isSpeaking || isThinking) && (
          <div
            className={`absolute inset-0 rounded-full animate-ping opacity-20 ${isThinking ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: isThinking ? '#f59e0b' : colors.ring,
              transform: 'scale(1.15)',
            }}
          />
        )}

        {/* Avatar circle */}
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold border-2 transition-all duration-300"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: isSpeaking ? colors.ring : isListening ? '#ef4444' : '#374151',
            boxShadow: isSpeaking
              ? `0 0 24px ${colors.ring}40`
              : isListening
              ? '0 0 24px #ef444440'
              : 'none',
          }}
        >
          {initials}

          {/* Thinking spinner overlay */}
          {isThinking && (
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
          )}
        </div>

        {/* Mic indicator dot */}
        {isListening && (
          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 border-2 border-gray-950 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        )}
      </div>

      {/* Name + title */}
      <div className="text-center">
        <p className="font-semibold text-white text-lg leading-tight">{name}</p>
        <p className="text-gray-400 text-sm mt-0.5">{title}</p>
      </div>

      {/* Status */}
      <p className={`text-xs font-medium transition-colors duration-200 ${statusColor}`}>
        {isThinking ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-flex gap-0.5">
              {[0,1,2].map(i => (
                <span
                  key={i}
                  className="inline-block w-1 h-1 rounded-full bg-amber-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            {statusText}
          </span>
        ) : statusText}
      </p>

      {/* Waveform */}
      <div className="w-full max-w-[220px] h-14">
        <Waveform mode={waveMode} color={waveColor} barCount={24} />
      </div>
    </div>
  )
}
