// ─── Types ─────────────────────────────────────────────────────────────────────

/** Raw message format stored in session history */
export interface GeminiTurn {
  role: 'interviewer' | 'candidate'
  content: string
}

/** Structured response Gemini returns for every interview turn */
export interface InterviewerResponse {
  message: string
  action: 'ask_followup' | 'next_question' | 'wrap_up' | 'end'
  question_number: number
  followup_count: number
}

/** What callGemini returns — either a parsed response or an error */
export type GeminiResult =
  | { ok: true; response: InterviewerResponse; model: string }
  | { ok: false; error: string; retryable: boolean }

// ─── Config ────────────────────────────────────────────────────────────────────

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

import {
  GEMINI_MODEL_FALLBACK_CHAIN,
  getModelTryOrder,
  resolveModelFromEnv,
  setPreferredModelIndex,
} from './geminiModels'

export { GEMINI_MODEL_FALLBACK_CHAIN } from './geminiModels'

function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) {
    throw new Error(
      'VITE_GEMINI_API_KEY is not set. Add it to your .env file. Get a free key at https://aistudio.google.com/apikey'
    )
  }
  return key
}

interface GenerationConfig {
  temperature: number
  maxOutputTokens: number
  responseMimeType: 'application/json'
}

interface GenerateBody {
  system_instruction: { parts: { text: string }[] }
  contents: { role: string; parts: { text: string }[] }[]
  generationConfig: GenerationConfig
}

type RawApiOutcome =
  | { kind: 'success'; data: unknown; model: string }
  | { kind: 'error'; status: number; message: string; retryable: boolean; tryNextModel: boolean }

function shouldTryNextModel(status: number, message: string): boolean {
  if (status === 429 || status === 503 || status === 500 || status === 502 || status === 504) {
    return true
  }
  // Model unavailable, overloaded, or quota on this specific model
  if (status === 404 || status === 400) {
    const lower = message.toLowerCase()
    return (
      lower.includes('not found') ||
      lower.includes('not supported') ||
      lower.includes('no longer available') ||
      lower.includes('quota')
    )
  }
  return false
}

async function generateContentRaw(
  model: string,
  apiKey: string,
  body: GenerateBody,
): Promise<RawApiOutcome> {
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const message = (errBody as { error?: { message?: string } })?.error?.message ?? res.statusText
    const tryNextModel = shouldTryNextModel(res.status, message)

    if (res.status === 401 || res.status === 403) {
      return {
        kind: 'error',
        status: res.status,
        message: message || 'Invalid API key. Check VITE_GEMINI_API_KEY in .env (or Vercel env vars).',
        retryable: false,
        tryNextModel: false,
      }
    }

    if (res.status === 429) {
      return {
        kind: 'error',
        status: res.status,
        message,
        retryable: true,
        tryNextModel: true,
      }
    }

    return {
      kind: 'error',
      status: res.status,
      message: `API error ${res.status}: ${message}`,
      retryable: res.status >= 500 || tryNextModel,
      tryNextModel,
    }
  }

  const data = await res.json()
  return { kind: 'success', data, model }
}

async function generateWithModelFallback(
  body: GenerateBody,
  label: string,
): Promise<RawApiOutcome> {
  const apiKey = getApiKey()
  const singleModel = resolveModelFromEnv()
  const modelsToTry: string[] = singleModel ? [singleModel] : getModelTryOrder()

  const failures: string[] = []

  for (const model of modelsToTry) {
    const outcome = await generateContentRaw(model, apiKey, body)

    if (outcome.kind === 'success') {
      const idx = (GEMINI_MODEL_FALLBACK_CHAIN as readonly string[]).indexOf(model)
      if (idx >= 0) setPreferredModelIndex(idx)
      if (failures.length > 0) {
        console.info(`[Gemini] ${label}: recovered using ${model} after:`, failures.join(' → '))
      }
      return outcome
    }

    failures.push(`${model} (${outcome.status})`)

    if (!outcome.tryNextModel) {
      return outcome
    }

    console.warn(`[Gemini] ${label}: ${model} unavailable, trying next model…`)
    await new Promise(r => setTimeout(r, 200))
  }

  return {
    kind: 'error',
    status: 429,
    message:
      'All Gemini models are rate-limited right now. Wait a minute and tap Retry, or check quotas at https://aistudio.google.com',
    retryable: true,
    tryNextModel: false,
  }
}

function parseInterviewerResponse(rawText: string): InterviewerResponse | null {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()
    return JSON.parse(cleaned) as InterviewerResponse
  } catch {
    return null
  }
}

// ─── Core API call ─────────────────────────────────────────────────────────────

/**
 * Call Gemini with full conversation history and get a structured InterviewerResponse.
 * Tries multiple free-tier models automatically on rate limits.
 */
export async function callGemini(
  systemPrompt: string,
  history: GeminiTurn[],
  userMessage: string,
): Promise<GeminiResult> {
  try {
    const contents = [
      ...history.map(turn => ({
        role: turn.role === 'interviewer' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ]

    const body: GenerateBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 350,
        responseMimeType: 'application/json',
      },
    }

    const outcome = await generateWithModelFallback(body, 'interview')

    if (outcome.kind === 'error') {
      return {
        ok: false,
        error: outcome.message,
        retryable: outcome.retryable,
      }
    }

    const data = outcome.data as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
    }
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!rawText) {
      const finishReason = data?.candidates?.[0]?.finishReason
      if (finishReason === 'SAFETY') {
        return {
          ok: false,
          error: 'Response blocked by safety filter. Try rephrasing.',
          retryable: false,
        }
      }
      return {
        ok: false,
        error: 'Empty response from Gemini. Try again.',
        retryable: true,
      }
    }

    let parsed = parseInterviewerResponse(rawText)

    if (!parsed) {
      console.error('[Gemini] Failed to parse JSON response:', rawText)
      return {
        ok: true,
        model: outcome.model,
        response: {
          message: rawText.slice(0, 300),
          action: 'next_question',
          question_number: 1,
          followup_count: 0,
        },
      }
    }

    if (!parsed.message || !parsed.action) {
      console.error('[Gemini] Response missing required fields:', parsed)
      return {
        ok: false,
        error: 'Malformed response from AI. Retrying...',
        retryable: true,
      }
    }

    parsed.message = parsed.message
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/`/g, '')
      .trim()

    return { ok: true, response: parsed, model: outcome.model }
  } catch (err) {
    console.error('[Gemini] Unexpected error:', err)

    if (err instanceof TypeError && err.message.includes('fetch')) {
      return {
        ok: false,
        error: 'Network error — check your internet connection.',
        retryable: true,
      }
    }

    if (err instanceof Error && err.message.includes('VITE_GEMINI_API_KEY')) {
      return { ok: false, error: err.message, retryable: false }
    }

    return {
      ok: false,
      error: String(err),
      retryable: false,
    }
  }
}

// ─── Debrief scoring call ─────────────────────────────────────────────────────

export async function scoreInterview(
  config: { role: string; interviewType: string; difficulty: string },
  transcript: GeminiTurn[],
): Promise<import('../types').SessionScore | null> {
  try {
    const scoringPrompt = `You are an expert interview coach. Analyze this ${config.interviewType} interview transcript for a ${config.difficulty}-level ${config.role} position.

Evaluate the CANDIDATE's performance only (not the interviewer's questions).

Respond with valid JSON only, no markdown:
{
  "overall": <0-10 score>,
  "summary": "<2-3 sentence honest overall assessment>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "gaps": ["<specific gap/improvement area 1>", "<specific gap/improvement area 2>"],
  "questionScores": [
    {
      "question": "<the interviewer's question>",
      "communication": <0-10>,
      "depth": <0-10>,
      "structure": <0-10>,
      "relevance": <0-10>,
      "overall": <0-10>,
      "feedback": "<1-2 sentences of specific, actionable feedback for this answer>"
    }
  ]
}

Scoring guide:
- 9-10: Exceptional — specific, structured, insightful, memorable
- 7-8: Good — solid answer with minor gaps
- 5-6: Average — passable but missing depth or specifics
- 3-4: Weak — vague, incomplete, or off-topic
- 1-2: Poor — failed to answer or very wrong

Be honest and specific. Generic feedback like "good communication" is not useful. Point to specific moments in the transcript.`

    const contents = transcript.map(turn => ({
      role: turn.role === 'interviewer' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    }))

    const body: GenerateBody = {
      system_instruction: { parts: [{ text: scoringPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
      },
    }

    const outcome = await generateWithModelFallback(body, 'scoring')
    if (outcome.kind === 'error') return null

    const data = outcome.data as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!rawText) return null

    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    return JSON.parse(cleaned) as import('../types').SessionScore
  } catch (err) {
    console.error('[Gemini] Scoring failed:', err)
    return null
  }
}
