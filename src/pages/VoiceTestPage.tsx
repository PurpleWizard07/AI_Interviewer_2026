import { useState } from 'react'
import { useVoice } from '../hooks/useVoice'
import type { KokoroVoice } from '../hooks/useTTS'
import { PERSONA_VOICES } from '../hooks/useTTS'

const TEST_PHRASES = [
  "Tell me about yourself and your background.",
  "What's your greatest technical challenge you've overcome?",
  "Why are you interested in this role?",
  "Describe a time you had a conflict with a teammate.",
]

const ALL_VOICES: { voice: KokoroVoice; label: string }[] = [
  { voice: 'af_heart', label: 'Sarah (warm, American female)' },
  { voice: 'af_nova', label: 'Nova (clear, American female)' },
  { voice: 'am_adam', label: 'Adam (neutral, American male)' },
  { voice: 'am_michael', label: 'Michael (deep, American male)' },
  { voice: 'bf_emma', label: 'Emma (British female)' },
  { voice: 'bm_george', label: 'George (British male)' },
]

export default function VoiceTestPage() {
  const [selectedVoice, setSelectedVoice] = useState<KokoroVoice>('af_heart')
  const [customText, setCustomText] = useState('')
  const [log, setLog] = useState<{ type: 'interviewer' | 'you' | 'system'; text: string }[]>([
    { type: 'system', text: '← Load the TTS model first, then test the full voice loop.' },
  ])

  const addLog = (type: 'interviewer' | 'you' | 'system', text: string) => {
    setLog(l => [...l, { type, text }])
  }

  const voice = useVoice({
    interviewerVoice: selectedVoice,
    onUserSpeechEnd: (transcript) => {
      addLog('you', transcript)
    },
  })

  async function handleLoad() {
    addLog('system', 'Loading Kokoro TTS model (~85MB, cached after first load)...')
    await voice.load()
    addLog('system', '✅ TTS model loaded and ready.')
  }

  async function handleSpeak(text: string) {
    addLog('interviewer', text)
    await voice.interviewerSpeak(text)
  }

  function handleListen() {
    addLog('system', '🎤 Listening... speak now, will auto-stop on silence.')
    voice.startListening()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="pt-4">
          <h1 className="text-xl font-semibold">Voice Pipeline Test</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Verify STT + TTS work before building the full interview
          </p>
        </div>

        {/* Status bar */}
        <div className="grid grid-cols-3 gap-3">
          <StatusCard
            label="TTS Model"
            value={
              voice.isLoading
                ? `Loading ${voice.loadProgress}%`
                : voice.isLoaded
                ? 'Ready'
                : 'Not loaded'
            }
            color={voice.isLoaded ? 'green' : voice.isLoading ? 'amber' : 'gray'}
          />
          <StatusCard
            label="Microphone"
            value={voice.isListening ? 'Listening…' : 'Idle'}
            color={voice.isListening ? 'indigo' : 'gray'}
          />
          <StatusCard
            label="Speaking"
            value={voice.isSpeaking ? 'Speaking…' : 'Silent'}
            color={voice.isSpeaking ? 'purple' : 'gray'}
          />
        </div>

        {/* Load progress bar */}
        {voice.isLoading && (
          <div className="space-y-1">
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${voice.loadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Downloading model… {voice.loadProgress}% — cached after this, instant next time
            </p>
          </div>
        )}

        {/* Step 1: Load model */}
        <Section title="Step 1 — Load TTS Model">
          <button
            onClick={handleLoad}
            disabled={voice.isLoaded || voice.isLoading}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              voice.isLoaded
                ? 'bg-green-500/10 border border-green-500/20 text-green-400 cursor-default'
                : voice.isLoading
                ? 'bg-gray-800 text-gray-500 cursor-wait'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
            }`}
          >
            {voice.isLoaded ? '✅ Model loaded' : voice.isLoading ? 'Loading…' : 'Load Kokoro TTS'}
          </button>
        </Section>

        {/* Step 2: Pick voice */}
        <Section title="Step 2 — Choose Interviewer Voice">
          <div className="grid grid-cols-1 gap-2">
            {ALL_VOICES.map(({ voice: v, label }) => (
              <button
                key={v}
                onClick={() => setSelectedVoice(v)}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                  selectedVoice === v
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'
                }`}
              >
                {Object.entries(PERSONA_VOICES).find(([, pv]) => pv === v)?.[0]
                  ? `${Object.entries(PERSONA_VOICES).find(([, pv]) => pv === v)![0]} — `
                  : ''}
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Step 3: Test TTS */}
        <Section title="Step 3 — Test Interviewer Voice (TTS)">
          <div className="space-y-2">
            {TEST_PHRASES.map((phrase) => (
              <button
                key={phrase}
                onClick={() => handleSpeak(phrase)}
                disabled={!voice.isLoaded || voice.isSpeaking}
                className="w-full text-left px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                "{phrase}"
              </button>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && customText.trim() && handleSpeak(customText)}
                placeholder="Or type custom text…"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => customText.trim() && handleSpeak(customText)}
                disabled={!voice.isLoaded || voice.isSpeaking || !customText.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Speak
              </button>
            </div>
          </div>
        </Section>

        {/* Step 4: Test STT */}
        <Section title="Step 4 — Test Your Mic (STT)">
          {!voice.isSTTSupported && (
            <p className="text-amber-400 text-sm">
              ⚠️ Web Speech API not supported in this browser. Use Chrome or Edge.
            </p>
          )}
          <div className="flex gap-3 items-center">
            <button
              onClick={handleListen}
              disabled={voice.isListening || voice.isSpeaking}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                voice.isListening
                  ? 'bg-red-500/10 border border-red-500/30 text-red-400 cursor-default'
                  : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {voice.isListening ? '● Recording…' : '🎤 Start Listening'}
            </button>
            {voice.isListening && (
              <button
                onClick={voice.stopListening}
                className="px-3 py-2 rounded-xl text-sm border border-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                Stop
              </button>
            )}
          </div>

          {/* Live interim transcript */}
          {(voice.isListening || voice.interimTranscript) && (
            <div className="mt-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Live transcript</p>
              <p className="text-sm text-gray-300">
                {voice.transcript}
                <span className="text-gray-500 italic">{voice.interimTranscript}</span>
              </p>
            </div>
          )}
        </Section>

        {/* Conversation log */}
        <Section title="Conversation Log">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {log.map((entry, i) => (
              <div
                key={i}
                className={`text-sm px-3 py-2 rounded-lg ${
                  entry.type === 'interviewer'
                    ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-200'
                    : entry.type === 'you'
                    ? 'bg-gray-800 border border-gray-700 text-gray-200'
                    : 'text-gray-500 italic text-xs'
                }`}
              >
                {entry.type === 'interviewer' && (
                  <span className="font-medium text-indigo-400 mr-2">Interviewer:</span>
                )}
                {entry.type === 'you' && (
                  <span className="font-medium text-gray-400 mr-2">You:</span>
                )}
                {entry.text}
              </div>
            ))}
          </div>
        </Section>

        {/* Errors */}
        {(voice.ttsError || voice.sttError) && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <p className="text-red-400 text-sm font-medium">Error</p>
            <p className="text-red-400/70 text-xs mt-0.5">{voice.ttsError || voice.sttError}</p>
          </div>
        )}

        <a
          href="/"
          className="block text-center text-sm text-gray-500 hover:text-gray-300 transition-colors pb-8"
        >
          ← Back to setup
        </a>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-gray-300">{title}</h2>
      {children}
    </div>
  )
}

function StatusCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: 'green' | 'amber' | 'indigo' | 'purple' | 'gray'
}) {
  const colors = {
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
    gray: 'bg-gray-800 border-gray-700 text-gray-500',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colors[color]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  )
}
