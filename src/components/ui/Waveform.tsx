import { useEffect, useRef } from 'react'

interface WaveformProps {
  /** 'speaking' = animated bars (interviewer talking)
   *  'listening' = pulsing bars (mic on)
   *  'idle'      = flat static bars */
  mode: 'speaking' | 'listening' | 'idle'
  barCount?: number
  color?: string
  className?: string
}

/**
 * Animated waveform using Web Audio API AnalyserNode when mic is active,
 * and a CSS animation fallback for the speaking/idle states.
 */
export function Waveform({ mode, barCount = 28, color, className = '' }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // ── Connect real mic analyser when listening ──────────────────────────────
  useEffect(() => {
    if (mode !== 'listening') {
      // Clean up mic stream when not listening
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      analyserRef.current = null
      return
    }

    async function connectMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        source.connect(analyser)
        analyserRef.current = analyser
      } catch {
        // Mic already granted by useSTT — analyser may not get it, fallback to animation
      }
    }
    connectMic()

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      analyserRef.current = null
    }
  }, [mode])

  // ── Canvas draw loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0

    function draw() {
      animRef.current = requestAnimationFrame(draw)
      if (!canvas || !ctx) return

      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      const barW = Math.max(2, (W / barCount) - 1.5)
      const gap = (W - barW * barCount) / (barCount - 1)

      // Try to get real mic data
      let freqData: Uint8Array<ArrayBuffer> | null = null
      if (analyserRef.current && mode === 'listening') {
        const bins = analyserRef.current.frequencyBinCount
        freqData = new Uint8Array(new ArrayBuffer(bins))
        analyserRef.current.getByteFrequencyData(freqData)
      }

      for (let i = 0; i < barCount; i++) {
        const x = i * (barW + gap)
        let heightFactor = 0

        if (mode === 'idle') {
          heightFactor = 0.06
        } else if (mode === 'speaking') {
          // Organic animated wave
          const t = frame * 0.04
          const wave1 = Math.sin(t + i * 0.5) * 0.5 + 0.5
          const wave2 = Math.sin(t * 1.3 + i * 0.3 + 1) * 0.5 + 0.5
          const wave3 = Math.sin(t * 0.7 + i * 0.8 + 2) * 0.5 + 0.5
          heightFactor = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2) * 0.85 + 0.1
        } else if (mode === 'listening') {
          if (freqData) {
            // Map bar index to frequency bin
            const binIndex = Math.floor((i / barCount) * freqData.length * 0.6)
            heightFactor = (freqData[binIndex] / 255) * 0.9 + 0.08
          } else {
            // Fallback pulse
            const t = frame * 0.06
            heightFactor = Math.abs(Math.sin(t + i * 0.4)) * 0.5 + 0.1
          }
        }

        const barH = Math.max(3, heightFactor * H)
        const y = (H - barH) / 2

        // Bar color — derive from CSS variable or prop
        const barColor =
          color ??
          (getComputedStyle(document.documentElement)
            .getPropertyValue('--waveform-color')
            .trim() || '#6366f1')

        // Rounded rect
        ctx.beginPath()
        ctx.roundRect(x, y, barW, barH, barW / 2)
        ctx.fillStyle = barColor
        ctx.globalAlpha = mode === 'idle' ? 0.3 : 0.85
        ctx.fill()
        ctx.globalAlpha = 1
      }

      frame++
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [mode, barCount, color])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={56}
      className={className}
      style={{ width: '100%', height: '56px' }}
    />
  )
}
