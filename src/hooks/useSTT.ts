import { useCallback, useRef, useState } from 'react'

/** How long to wait after the last heard speech before auto-submitting. */
export const STT_SILENCE_SUBMIT_MS = 4000

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
 * - Continuous recognition so brief pauses do not end the session
 * - Auto-submits only after STT_SILENCE_SUBMIT_MS without new speech
 * - Tap stop (or parent stop()) to submit immediately
 * - interimTranscript shows live words while speaking
 */
export function useSTT(onFinalTranscript?: (text: string) => void): UseSTTReturn {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const callbackRef = useRef(onFinalTranscript)
  callbackRef.current = onFinalTranscript

  const shouldListenRef = useRef(false)
  const isRestartRef = useRef(false)
  const transcriptRef = useRef('')
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [state, setState] = useState<STTState>({
    transcript: '',
    interimTranscript: '',
    isListening: false,
    isSupported:
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
    error: null,
  })

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const finishSession = useCallback(() => {
    shouldListenRef.current = false
    clearSilenceTimer()
    recognitionRef.current?.stop()
  }, [clearSilenceTimer])

  const scheduleSilenceSubmit = useCallback(() => {
    clearSilenceTimer()
    if (!shouldListenRef.current) return

    silenceTimerRef.current = setTimeout(() => {
      if (shouldListenRef.current) {
        finishSession()
      }
    }, STT_SILENCE_SUBMIT_MS)
  }, [clearSilenceTimer, finishSession])

  const startRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    if (recognitionRef.current) {
      recognitionRef.current.abort()
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setState(s => {
        const clearText = !isRestartRef.current
        if (clearText) {
          transcriptRef.current = ''
        }
        isRestartRef.current = false
        return {
          ...s,
          isListening: true,
          error: null,
          ...(clearText ? { transcript: '', interimTranscript: '' } : {}),
        }
      })
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

      if (finalChunk || interimChunk) {
        scheduleSilenceSubmit()
      }

      setState(s => {
        const nextTranscript = s.transcript + finalChunk
        transcriptRef.current = nextTranscript
        return {
          ...s,
          transcript: nextTranscript,
          interimTranscript: interimChunk,
        }
      })
    }

    recognition.onend = () => {
      if (shouldListenRef.current) {
        isRestartRef.current = true
        try {
          recognition.start()
        } catch {
          startRecognition()
        }
        return
      }

      clearSilenceTimer()
      const finalText = transcriptRef.current.trim()
      transcriptRef.current = ''
      setState(s => ({
        ...s,
        isListening: false,
        interimTranscript: '',
        transcript: '',
      }))

      if (finalText && callbackRef.current) {
        callbackRef.current(finalText)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const ignoredErrors = ['no-speech', 'aborted']
      if (ignoredErrors.includes(event.error)) {
        if (shouldListenRef.current) {
          isRestartRef.current = true
          try {
            recognition.start()
          } catch {
            // Browser ended the session; a fresh instance is started on the next start() call.
          }
        }
        return
      }

      shouldListenRef.current = false
      clearSilenceTimer()
      setState(s => ({
        ...s,
        isListening: false,
        error: event.error,
      }))
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [clearSilenceTimer, scheduleSilenceSubmit])

  const start = useCallback(() => {
    shouldListenRef.current = true
    transcriptRef.current = ''
    clearSilenceTimer()
    startRecognition()
  }, [clearSilenceTimer, startRecognition])

  const stop = useCallback(() => {
    finishSession()
  }, [finishSession])

  const reset = useCallback(() => {
    transcriptRef.current = ''
    clearSilenceTimer()
    setState(s => ({ ...s, transcript: '', interimTranscript: '', error: null }))
  }, [clearSilenceTimer])

  return { ...state, start, stop, reset }
}
