import { useEffect, useRef } from 'react'
import type { Message } from '../../types'

interface TranscriptPanelProps {
  messages: Message[]
  interviewerName: string
  isThinking: boolean
  interimTranscript: string
  liveTranscript: string
  isListening: boolean
}

export function TranscriptPanel({
  messages,
  interviewerName,
  isThinking,
  interimTranscript,
  liveTranscript,
  isListening,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages or interim text
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interimTranscript])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-600 text-sm">Conversation will appear here…</p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          message={msg}
          interviewerName={interviewerName}
          isLast={i === messages.length - 1}
        />
      ))}

      {/* Thinking dots */}
      {isThinking && (
        <div className="flex gap-2 items-end">
          <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-semibold text-gray-400 flex-shrink-0">
            {interviewerName.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
            {[0,1,2].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce inline-block"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Live mic transcript */}
      {isListening && (liveTranscript || interimTranscript) && (
        <div className="flex justify-end gap-2 items-end">
          <div className="max-w-[80%] bg-indigo-500/15 border border-indigo-500/25 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-indigo-200 leading-relaxed">
            <span>{liveTranscript}</span>
            <span className="text-indigo-400/50 italic">{interimTranscript}</span>
            <span className="inline-block w-0.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function MessageBubble({
  message,
  interviewerName,
  isLast,
}: {
  message: Message
  interviewerName: string
  isLast: boolean
}) {
  const isInterviewer = message.role === 'interviewer'
  const initials = interviewerName.split(' ').map(n => n[0]).join('')

  if (isInterviewer) {
    return (
      <div className={`flex gap-2 items-end ${isLast ? '' : 'opacity-80'}`}>
        {/* Avatar */}
        <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-semibold text-gray-300 flex-shrink-0 mb-0.5">
          {initials}
        </div>
        {/* Bubble */}
        <div className="max-w-[82%] bg-gray-800 border border-gray-700/50 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-100 leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex justify-end ${isLast ? '' : 'opacity-80'}`}>
      <div className="max-w-[82%] bg-indigo-600 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-white leading-relaxed">
        {message.content}
      </div>
    </div>
  )
}
