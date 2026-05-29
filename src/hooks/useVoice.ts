import { useCallback, useRef } from 'react'
import { useSTT } from './useSTT'
import { useTTS, type KokoroVoice, type SpeakOptions } from './useTTS'

interface UseVoiceOptions {
  /**
   * Called when the user finishes speaking and STT produces a transcript.
   * This is where you send the answer to Gemini and get a response.
   */
  onUserSpeechEnd?: (transcript: string) => void
  /** Voice persona for the interviewer */
  interviewerVoice?: KokoroVoice
}

/**
 * useVoice — The master voice loop hook
 *
 * Coordinates STT and TTS so they never overlap:
 * - While TTS is speaking → mic is blocked (no accidental triggering)
 * - While STT is listening → TTS is silenced if somehow active
 * - speak() waits for TTS to finish before resolving
 */
export function useVoice({
  onUserSpeechEnd,
  interviewerVoice = 'af_heart',
}: UseVoiceOptions = {}) {
  const isTTSActiveRef = useRef(false)
  const speakChainRef = useRef<Promise<void>>(Promise.resolve())

  const tts = useTTS()

  const runQueued = useCallback((job: () => Promise<void>) => {
    const next = speakChainRef.current.then(job).catch(() => {})
    speakChainRef.current = next
    return next
  }, [])

  const handleFinalTranscript = useCallback(
    (text: string) => {
      if (!isTTSActiveRef.current) {
        onUserSpeechEnd?.(text)
      }
    },
    [onUserSpeechEnd],
  )

  const stt = useSTT(handleFinalTranscript)

  const load = useCallback(async () => {
    await tts.load()
    // Warm WASM synthesis so the first real question is faster
    await tts.prepare('Hello.', interviewerVoice)
  }, [tts, interviewerVoice])

  /** Start synthesizing before speak — overlaps with UI "thinking" time. */
  const prepareInterviewerSpeech = useCallback(
    (text: string) => tts.prepare(text, interviewerVoice),
    [tts, interviewerVoice],
  )

  const interviewerSpeak = useCallback(
    (text: string, options?: SpeakOptions) =>
      runQueued(async () => {
        stt.stop()
        isTTSActiveRef.current = true
        await tts.speak(text, interviewerVoice, options)
        isTTSActiveRef.current = false
      }),
    [runQueued, tts, stt, interviewerVoice],
  )

  const startListening = useCallback(() => {
    if (isTTSActiveRef.current) return
    tts.stop()
    stt.reset()
    stt.start()
  }, [stt, tts])

  const stopListening = useCallback(() => {
    stt.stop()
  }, [stt])

  const stopSpeaking = useCallback(() => {
    tts.stop()
    isTTSActiveRef.current = false
  }, [tts])

  return {
    isLoaded: tts.isLoaded,
    isLoading: tts.isLoading,
    loadProgress: tts.loadProgress,
    isGenerating: tts.isGenerating,
    isSpeaking: tts.isSpeaking,
    isListening: stt.isListening,
    transcript: stt.transcript,
    interimTranscript: stt.interimTranscript,
    isSTTSupported: stt.isSupported,
    ttsError: tts.error,
    sttError: stt.error,
    load,
    prepareInterviewerSpeech,
    interviewerSpeak,
    startListening,
    stopListening,
    stopSpeaking,
  }
}
