import { useCallback, useRef, useState } from 'react'

interface STTState {
  transcript: string
  interimTranscript: string
  isListening: boolean
  isSupported: boolean
  error: string | null
}

interface UseSTTReturn extends STTState {
  start: () => void
  stop: () => void
  reset: () => void
}

/**
 * useSTT — Speech to Text via Web Speech API
 *
 * How it works:
 * - Starts mic when you call start()
 * - Web Speech API handles silence detection automatically (stops after ~1.5s of silence)
 * - Fires onFinalTranscript callback with the full recognized text
 * - interimTranscript shows live "in progress" words while speaking
 */
export function useSTT(onFinalTranscript?: (text: string) => void): UseSTTReturn {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // Use a ref for the callback to always have the latest version without re-creating handlers
  const callbackRef = useRef(onFinalTranscript)
  callbackRef.current = onFinalTranscript

  const [state, setState] = useState<STTState>({
    transcript: '',
    interimTranscript: '',
    isListening: false,
    isSupported:
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
    error: null,
  })

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    // Stop any existing session cleanly
    if (recognitionRef.current) {
      recognitionRef.current.abort()
    }

    const recognition = new SR()
    recognition.continuous = false      // Auto-stops after silence — perfect for interview answers
    recognition.interimResults = true   // Show words as they're being spoken
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setState(s => ({
        ...s,
        isListening: true,
        error: null,
        transcript: '',
        interimTranscript: '',
      }))
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalChunk = ''
      let interimChunk = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalChunk += result[0].transcript
        } else {
          interimChunk += result[0].transcript
        }
      }

      setState(s => ({
        ...s,
        transcript: s.transcript + finalChunk,
        interimTranscript: interimChunk,
      }))
    }

    recognition.onend = () => {
      // Use functional update to get latest transcript value
      setState(s => {
        const finalText = s.transcript.trim()
        if (finalText && callbackRef.current) {
          callbackRef.current(finalText)
        }
        return { ...s, isListening: false, interimTranscript: '' }
      })
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' is normal (user didn't say anything) — not a real error
      const ignoredErrors = ['no-speech', 'aborted']
      setState(s => ({
        ...s,
        isListening: false,
        error: ignoredErrors.includes(event.error) ? null : event.error,
      }))
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const reset = useCallback(() => {
    setState(s => ({ ...s, transcript: '', interimTranscript: '', error: null }))
  }, [])

  return { ...state, start, stop, reset }
}
