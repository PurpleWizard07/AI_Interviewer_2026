/**
 * Free-tier Gemini models for generateContent, ordered by preference.
 * Each model has separate rate limits — on 429 we try the next.
 * @see https://ai.google.dev/gemini-api/docs/pricing
 */
export const GEMINI_MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
] as const

export type GeminiModelId = (typeof GEMINI_MODEL_FALLBACK_CHAIN)[number]

/** Index of the last model that succeeded this session (sticky routing). */
let preferredModelIndex = 0

export function getPreferredModelIndex(): number {
  return preferredModelIndex
}

export function setPreferredModelIndex(index: number): void {
  if (index >= 0 && index < GEMINI_MODEL_FALLBACK_CHAIN.length) {
    preferredModelIndex = index
  }
}

/** Models to try: preferred first, then the rest of the chain. */
export function getModelTryOrder(): GeminiModelId[] {
  const chain = [...GEMINI_MODEL_FALLBACK_CHAIN]
  return [...chain.slice(preferredModelIndex), ...chain.slice(0, preferredModelIndex)]
}

export function resolveModelFromEnv(): GeminiModelId | null {
  const override = import.meta.env.VITE_GEMINI_MODEL?.trim()
  if (!override) return null
  if ((GEMINI_MODEL_FALLBACK_CHAIN as readonly string[]).includes(override)) {
    return override as GeminiModelId
  }
  console.warn(`[Gemini] VITE_GEMINI_MODEL="${override}" is not in fallback chain; using chain.`)
  return null
}
