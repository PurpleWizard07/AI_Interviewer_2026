interface ScoreRingProps {
  score: number   // 0-10
  size?: number
  strokeWidth?: number
  label?: string
  showNumber?: boolean
}

function scoreColor(score: number): string {
  if (score >= 8) return '#22c55e'   // green
  if (score >= 6) return '#6366f1'   // indigo
  if (score >= 4) return '#f59e0b'   // amber
  return '#ef4444'                    // red
}

function scoreLabel(score: number): string {
  if (score >= 9) return 'Exceptional'
  if (score >= 8) return 'Strong'
  if (score >= 7) return 'Good'
  if (score >= 6) return 'Solid'
  if (score >= 5) return 'Average'
  if (score >= 4) return 'Weak'
  return 'Poor'
}

export function ScoreRing({ score, size = 80, strokeWidth = 6, label, showNumber = true }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = score / 10
  const dashOffset = circumference * (1 - progress)
  const color = scoreColor(score)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#1f2937" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s ease-out, stroke 0.3s ease' }}
          />
        </svg>
        {showNumber && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold leading-none" style={{ color }}>
              {score.toFixed(1)}
            </span>
            <span className="text-[10px] text-gray-500 mt-0.5">/ 10</span>
          </div>
        )}
      </div>
      {label && (
        <span className="text-xs text-gray-500 text-center">{label}</span>
      )}
    </div>
  )
}

export function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score)
  const pct = (score / 10) * 100

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs font-semibold" style={{ color }}>{score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export { scoreColor, scoreLabel }
