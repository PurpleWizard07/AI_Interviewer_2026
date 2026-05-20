import { useCallback, useRef } from 'react'
import { useSTT } from './useSTT'
import { useTTS, type KokoroVoice } from './useTTS'

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
 *
 * Usage in InterviewPage:
 *   const voice = useVoice({ onUserSpeechEnd: handleAnswer })
 *   await voice.load()
 *   await voice.interviewerSpeak("Tell me about yourself")
 *   voice.startListening()   // user speaks, auto-stops on silence
 */
export function useVoice({
  onUserSpeechEnd,
  interviewerVoice = 'af_heart',
}: UseVoiceOptions = {}) {
  const isTTSActiveRef = useRef(false)

  const tts = useTTS()

  const handleFinalTranscript = useCallback(
    (text: string) => {
      if (!isTTSActiveRef.current) {
        onUserSpeechEnd?.(text)
      }
    },
    [onUserSpeechEnd],
  )

  const stt = useSTT(handleFinalTranscript)

  /** Load the Kokoro TTS model. Call this once on mount. */
  const load = useCallback(async () => {
    await tts.load()
  }, [tts])

  /**
   * Speak as the interviewer.
   * Blocks mic while speaking, resolves when speech is done.
   */
  const interviewerSpeak = useCallback(
    async (text: string) => {
      // Stop mic if somehow running
      stt.stop()

      isTTSActiveRef.current = true
      await tts.speak(text, interviewerVoice)
      isTTSActiveRef.current = false
    },
    [tts, stt, interviewerVoice],
  )

  /**
   * Start listening to the user.
   * Auto-stops after ~1.5s of silence, fires onUserSpeechEnd callback.
   */
  const startListening = useCallback(() => {
    if (isTTSActiveRef.current) return  // Don't listen while speaking
    tts.stop()
    stt.reset()
    stt.start()
  }, [stt, tts])

  /** Stop listening immediately (e.g. user clicked stop) */
  const stopListening = useCallback(() => {
    stt.stop()
  }, [stt])

  /** Interrupt the interviewer speaking */
  const stopSpeaking = useCallback(() => {
    tts.stop()
    isTTSActiveRef.current = false
  }, [tts])

  return {
    // State
    isLoaded: tts.isLoaded,
    isLoading: tts.isLoading,
    loadProgress: tts.loadProgress,
    isSpeaking: tts.isSpeaking,
    isListening: stt.isListening,
    transcript: stt.transcript,
    interimTranscript: stt.interimTranscript,
    isSTTSupported: stt.isSupported,
    ttsError: tts.error,
    sttError: stt.error,

    // Actions
    load,
    interviewerSpeak,
    startListening,
    stopListening,
    stopSpeaking,
  }
}
