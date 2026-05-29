import { useCallback, useRef, useState } from 'react'

interface TTSState {
  isLoaded: boolean
  isLoading: boolean
  loadProgress: number   // 0-100, for showing download progress bar
  isGenerating: boolean  // Kokoro synthesizing audio (not yet audible)
  isSpeaking: boolean    // Audio actively playing
  error: string | null
}

export interface SpeakOptions {
  /** Fired when playback actually starts (after synthesis). */
  onSpeechStart?: () => void
}

interface PreparedClip {
  text: string
  voice: KokoroVoice
  audio: Float32Array
  sampling_rate: number
}

interface UseTTSReturn extends TTSState {
  load: () => Promise<void>
  /** Synthesize audio in the background before speak() is called. */
  prepare: (text: string, voice?: KokoroVoice) => Promise<void>
  speak: (text: string, voice?: KokoroVoice, options?: SpeakOptions) => Promise<void>
  stop: () => void
}

// Kokoro supports many voices — these are the best for an interviewer persona
export type KokoroVoice =
  | 'af_heart'      // Warm, natural American female (default — great for HR/behavioral)
  | 'af_nova'       // Clear, confident American female
  | 'am_adam'       // American male, neutral
  | 'am_michael'    // American male, deeper
  | 'bf_emma'       // British female
  | 'bm_george'     // British male, authoritative (good for senior/staff interviews)

// Map interview personas to voices
export const PERSONA_VOICES: Record<string, KokoroVoice> = {
  'Sarah Chen': 'af_heart',
  'Arjun Mehta': 'am_michael',
  'Priya Nair': 'af_nova',
  'James Okafor': 'am_adam',
}

/**
 * useTTS — Text to Speech via Kokoro.js
 *
 * Kokoro runs 100% in the browser using WebGPU/WASM.
 * - No API calls, no cost, no rate limits
 * - First load downloads ~85MB model (q8 quantized), cached in browser IndexedDB
 * - Subsequent loads are instant (served from cache)
 */
export function useTTS(): UseTTSReturn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ttsRef = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const isSpeakingRef = useRef(false)
  const preparedRef = useRef<PreparedClip | null>(null)
  const preparePromiseRef = useRef<{ key: string; promise: Promise<void> } | null>(null)

  const [state, setState] = useState<TTSState>({
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    isGenerating: false,
    isSpeaking: false,
    error: null,
  })

  const clipKey = (text: string, voice: KokoroVoice) => `${voice}::${text.trim()}`

  const playAudioBuffer = useCallback(
    async (audio: Float32Array, sampling_rate: number, options?: SpeakOptions) => {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const audioBuffer = ctx.createBuffer(1, audio.length, sampling_rate)
      audioBuffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      sourceRef.current = source

      await new Promise<void>(resolve => {
        source.onended = () => {
          isSpeakingRef.current = false
          setState(s => ({ ...s, isGenerating: false, isSpeaking: false }))
          resolve()
        }
        options?.onSpeechStart?.()
        source.start(0)
      })
    },
    [],
  )

  const load = useCallback(async () => {
    if (ttsRef.current !== null || state.isLoading) return

    setState(s => ({ ...s, isLoading: true, error: null, loadProgress: 0 }))

    try {
      const { KokoroTTS } = await import('kokoro-js')

      const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'wasm',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (info: any) => {
          if (info.status === 'progress' && info.total > 0) {
            const pct = Math.round((info.loaded / info.total) * 100)
            setState(s => ({ ...s, loadProgress: pct }))
          }
        },
      })

      ttsRef.current = tts
      setState(s => ({ ...s, isLoaded: true, isLoading: false, loadProgress: 100 }))
    } catch (err) {
      console.error('[useTTS] load failed:', err)
      setState(s => ({
        ...s,
        isLoading: false,
        error: `Failed to load TTS model: ${String(err)}`,
      }))
    }
  }, [state.isLoading])

  const stopPlayback = useCallback(() => {
    try {
      sourceRef.current?.stop()
    } catch {
      // Ignore "already stopped" errors
    }
    sourceRef.current = null
  }, [])

  const stop = useCallback(() => {
    stopPlayback()
    isSpeakingRef.current = false
    preparedRef.current = null
    preparePromiseRef.current = null
    setState(s => ({ ...s, isGenerating: false, isSpeaking: false }))
  }, [stopPlayback])

  const prepare = useCallback(
    async (text: string, voice: KokoroVoice = 'af_heart'): Promise<void> => {
      if (!ttsRef.current) return
      const trimmed = text.trim()
      if (!trimmed) return

      const key = clipKey(trimmed, voice)
      if (preparedRef.current && clipKey(preparedRef.current.text, preparedRef.current.voice) === key) {
        return
      }
      if (preparePromiseRef.current?.key === key) {
        return preparePromiseRef.current.promise
      }

      const promise = (async () => {
        setState(s => ({ ...s, isGenerating: true, isSpeaking: false, error: null }))
        try {
          const result = await ttsRef.current.generate(trimmed, { voice })
          preparedRef.current = {
            text: trimmed,
            voice,
            audio: result.audio,
            sampling_rate: result.sampling_rate,
          }
        } catch (err) {
          console.error('[useTTS] prepare failed:', err)
          setState(s => ({
            ...s,
            error: `Speech failed: ${String(err)}`,
          }))
        } finally {
          setState(s => ({ ...s, isGenerating: false }))
          if (preparePromiseRef.current?.key === key) {
            preparePromiseRef.current = null
          }
        }
      })()

      preparePromiseRef.current = { key, promise }
      return promise
    },
    [],
  )

  const speak = useCallback(
    async (text: string, voice: KokoroVoice = 'af_heart', options?: SpeakOptions): Promise<void> => {
      if (!ttsRef.current) {
        console.warn('[useTTS] Model not loaded yet. Call load() first.')
        return
      }
      const trimmed = text.trim()
      if (!trimmed) return

      stopPlayback()

      isSpeakingRef.current = true
      const key = clipKey(trimmed, voice)

      try {
        if (preparePromiseRef.current?.key === key) {
          await preparePromiseRef.current.promise
        }

        const cached = preparedRef.current
        if (cached && clipKey(cached.text, cached.voice) === key) {
          preparedRef.current = null
          setState(s => ({ ...s, isGenerating: false, isSpeaking: true, error: null }))
          if (!isSpeakingRef.current) return
          await playAudioBuffer(cached.audio, cached.sampling_rate, options)
          return
        }

        setState(s => ({ ...s, isGenerating: true, isSpeaking: false, error: null }))
        const result = await ttsRef.current.generate(trimmed, { voice })
        if (!isSpeakingRef.current) return

        setState(s => ({ ...s, isGenerating: false, isSpeaking: true }))
        await playAudioBuffer(result.audio, result.sampling_rate, options)
      } catch (err) {
        console.error('[useTTS] speak failed:', err)
        isSpeakingRef.current = false
        setState(s => ({
          ...s,
          isGenerating: false,
          isSpeaking: false,
          error: `Speech failed: ${String(err)}`,
        }))
      }
    },
    [playAudioBuffer, stopPlayback],
  )

  return { ...state, load, prepare, speak, stop }
}
