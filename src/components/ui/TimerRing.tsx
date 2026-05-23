interface TimerRingProps {
  /** Elapsed seconds */
  elapsed: number
  /** Total session seconds */
  total: number
  size?: number
  strokeWidth?: number
}

/**
 * Circular countdown ring.
 * - Green → amber at 75% elapsed → red at 90%
 * - Shows MM:SS in center
 */
export function TimerRing({ elapsed, total, size = 72, strokeWidth = 5 }: TimerRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(elapsed / total, 1)
  const dashOffset = circumference * (1 - progress)

  const remaining = Math.max(total - elapsed, 0)
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  const color =
    progress >= 0.9
      ? '#ef4444'   // red
      : progress >= 0.75
      ? '#f59e0b'   // amber
      : '#6366f1'   // indigo

  const bgColor =
    progress >= 0.9
      ? '#450a0a'
      : progress >= 0.75
      ? '#451a03'
      : '#1e1b4b'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill={bgColor}
          stroke="#374151"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
        />
      </svg>
      {/* Time label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-mono font-semibold leading-none" style={{ color }}>
          {mins}:{secs.toString().padStart(2, '0')}
        </span>
        <span className="text-[9px] text-gray-600 mt-0.5 leading-none">left</span>
      </div>
    </div>
  )
}
