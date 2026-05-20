import { useCallback, useRef, useState } from 'react'

interface TTSState {
  isLoaded: boolean
  isLoading: boolean
  loadProgress: number   // 0-100, for showing download progress bar
  isSpeaking: boolean
  error: string | null
}

interface UseTTSReturn extends TTSState {
  load: () => Promise<void>
  speak: (text: string, voice?: KokoroVoice) => Promise<void>
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
 *
 * Usage:
 *   const { load, speak, stop, isLoaded, isLoading, loadProgress, isSpeaking } = useTTS()
 *   await load()          // call once at app startup
 *   await speak("Hello")  // speaks and resolves when done
 *   stop()                // interrupts current speech
 */
export function useTTS(): UseTTSReturn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ttsRef = useRef<any>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const isSpeakingRef = useRef(false)

  const [state, setState] = useState<TTSState>({
    isLoaded: false,
    isLoading: false,
    loadProgress: 0,
    isSpeaking: false,
    error: null,
  })

  const load = useCallback(async () => {
    // Don't double-load
    if (ttsRef.current !== null || state.isLoading) return

    setState(s => ({ ...s, isLoading: true, error: null, loadProgress: 0 }))

    try {
      // Dynamic import so Vite doesn't try to bundle WASM into main chunk
      const { KokoroTTS } = await import('kokoro-js')

      const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',  // ~85MB — best quality/size tradeoff
        device: 'wasm', // explicit WASM — required for browser; don't rely on auto-detect
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (info: any) => {
          // info.status can be 'initiate', 'download', 'progress', 'done'
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

  const stop = useCallback(() => {
    try {
      sourceRef.current?.stop()
    } catch {
      // Ignore "already stopped" errors
    }
    sourceRef.current = null
    isSpeakingRef.current = false
    setState(s => ({ ...s, isSpeaking: false }))
  }, [])

  const speak = useCallback(
    async (text: string, voice: KokoroVoice = 'af_heart'): Promise<void> => {
      if (!ttsRef.current) {
        console.warn('[useTTS] Model not loaded yet. Call load() first.')
        return
      }
      if (!text.trim()) return

      // Stop anything currently playing
      stop()

      isSpeakingRef.current = true
      setState(s => ({ ...s, isSpeaking: true, error: null }))

      try {
        // Generate audio — returns { audio: Float32Array, sampling_rate: number }
        const result = await ttsRef.current.generate(text, { voice })

        // If stop() was called while generating, don't play
        if (!isSpeakingRef.current) return

        // Create AudioContext lazily (browsers require user gesture first)
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext()
        }
        const ctx = audioCtxRef.current

        // Resume context if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
          await ctx.resume()
        }

        // Convert Float32Array to Web Audio API buffer
        const audioBuffer = ctx.createBuffer(
          1,                        // mono
          result.audio.length,
          result.sampling_rate,
        )
        audioBuffer.copyToChannel(result.audio, 0)

        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        sourceRef.current = source

        // Resolve the promise when speech finishes
        await new Promise<void>(resolve => {
          source.onended = () => {
            isSpeakingRef.current = false
            setState(s => ({ ...s, isSpeaking: false }))
            resolve()
          }
          source.start(0)
        })
      } catch (err) {
        console.error('[useTTS] speak failed:', err)
        isSpeakingRef.current = false
        setState(s => ({
          ...s,
          isSpeaking: false,
          error: `Speech failed: ${String(err)}`,
        }))
      }
    },
    [stop],
  )

  return { ...state, load, speak, stop }
}