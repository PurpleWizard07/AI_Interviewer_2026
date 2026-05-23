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
  | { ok: true; response: InterviewerResponse }
  | { ok: false; error: string; retryable: boolean }

// ─── Config ────────────────────────────────────────────────────────────────────

// gemini-2.5-flash-lite: best free-tier throughput (1,000 RPD) — plenty for interviews
const MODEL = 'gemini-2.5-flash-lite'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) {
    throw new Error(
      'VITE_GEMINI_API_KEY is not set. Add it to your .env file. Get a free key at https://aistudio.google.com/apikey'
    )
  }
  return key
}

// ─── Core API call ─────────────────────────────────────────────────────────────

/**
 * Call Gemini with full conversation history and get a structured InterviewerResponse.
 *
 * @param systemPrompt - The built system prompt (persona + rules + rubric)
 * @param history - Full conversation history so far
 * @param userMessage - The latest message from the candidate (or "START_INTERVIEW" for first call)
 */
export async function callGemini(
  systemPrompt: string,
  history: GeminiTurn[],
  userMessage: string,
): Promise<GeminiResult> {
  try {
    const apiKey = getApiKey()

    // Build the contents array — Gemini alternates user/model roles
    // Map our 'interviewer' → 'model' and 'candidate' → 'user'
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

    const body = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        temperature: 0.75,          // Enough variety to feel human, not too random
        maxOutputTokens: 350,       // ~60 words spoken + JSON overhead — keep it tight
        responseMimeType: 'application/json',  // Forces valid JSON output — critical
      },
    }

    const res = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    // ── Handle HTTP errors ──────────────────────────────────────────────────
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const message = errBody?.error?.message ?? res.statusText

      if (res.status === 429) {
        return {
          ok: false,
          error: 'Rate limit reached. Please wait a moment before continuing.',
          retryable: true,
        }
      }

      if (res.status === 400) {
        return {
          ok: false,
          error: `Bad request: ${message}`,
          retryable: false,
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: message || 'Invalid API key. Check VITE_GEMINI_API_KEY in .env (or Vercel env vars).',
          retryable: false,
        }
      }

      return {
        ok: false,
        error: `API error ${res.status}: ${message}`,
        retryable: res.status >= 500,
      }
    }

    // ── Parse response ──────────────────────────────────────────────────────
    const data = await res.json()
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!rawText) {
      // Check for safety blocks or finish reasons
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

    // ── Parse JSON from response ────────────────────────────────────────────
    let parsed: InterviewerResponse

    try {
      // responseMimeType: 'application/json' should give clean JSON, but strip fences just in case
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[Gemini] Failed to parse JSON response:', rawText)
      // Graceful fallback — extract the message as plain text if JSON parse fails
      return {
        ok: true,
        response: {
          message: rawText.slice(0, 300),
          action: 'next_question',
          question_number: 1,
          followup_count: 0,
        },
      }
    }

    // ── Validate required fields ────────────────────────────────────────────
    if (!parsed.message || !parsed.action) {
      console.error('[Gemini] Response missing required fields:', parsed)
      return {
        ok: false,
        error: 'Malformed response from AI. Retrying...',
        retryable: true,
      }
    }

    // Sanitize message — strip any markdown that leaked through
    parsed.message = parsed.message
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/`/g, '')
      .trim()

    return { ok: true, response: parsed }
  } catch (err) {
    console.error('[Gemini] Unexpected error:', err)

    if (err instanceof TypeError && err.message.includes('fetch')) {
      return {
        ok: false,
        error: 'Network error — check your internet connection.',
        retryable: true,
      }
    }

    return {
      ok: false,
      error: String(err),
      retryable: false,
    }
  }
}

// ─── Debrief scoring call ─────────────────────────────────────────────────────

/**
 * Separate call at end of interview — asks Gemini to score the full session.
 * Uses a different prompt focused purely on evaluation.
 */
export async function scoreInterview(
  config: { role: string; interviewType: string; difficulty: string },
  transcript: GeminiTurn[],
): Promise<import('../types').SessionScore | null> {
  try {
    const apiKey = getApiKey()

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

    const res = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: scoringPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.3,          // Lower temp for consistent scoring
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    return JSON.parse(cleaned) as import('../types').SessionScore
  } catch (err) {
    console.error('[Gemini] Scoring failed:', err)
    return null
  }
}
