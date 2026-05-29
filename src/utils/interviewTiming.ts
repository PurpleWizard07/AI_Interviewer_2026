/** Minutes before session end when the app triggers wrap-up (matches systemPrompt). */
export function wrapUpThresholdSeconds(durationMinutes: number): number {
  return Math.max(2, Math.floor(durationMinutes * 0.1)) * 60
}

export function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
