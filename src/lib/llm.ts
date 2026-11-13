import { db } from '@/lib/db'

/**
 * AI brain for live calls — the LLM that turns the user's speech into replies.
 *
 * Why this exists: the built-in z-ai SDK reads its credentials from a local
 * config FILE (`.z-ai-config`), which never exists on Vercel serverless — so
 * on the deployed app every LLM attempt failed and the call fell back to a
 * canned "network" line. This module makes the brain configurable exactly
 * like the fish.audio voice:
 *
 *   1. Server env vars      LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
 *   2. Per-account settings (llmApiKey / llmBaseUrl / llmModel on User,
 *      editable from the dashboard — OpenAI-compatible, e.g. OpenRouter free
 *      models or Z.ai GLM)
 *   3. Local dev fallback   the `.z-ai-config` file via the z-ai SDK
 *                           (only outside production — the file never exists
 *                           on Vercel anyway)
 *
 * Every provider is OpenAI-compatible: POST {baseUrl}/chat/completions with
 * Bearer auth, streaming as SSE `data: {choices:[{delta:{content}}]}` lines.
 */

export type LLMConfig = { baseUrl: string; apiKey: string; model: string }

export const LLM_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
export const LLM_DEFAULT_MODEL = 'openrouter/free'
export const LLM_PRESETS = [
  { label: 'OpenRouter (فيه نماذج مجانية)', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free' },
  { label: 'Z.ai GLM (bigmodel)', baseUrl: 'https://api.z.ai/api/paas/v4', model: 'glm-4-flash' },
] as const

/** Read the brain config for one account: env first, then the user record. */
export async function resolveLLM(userId: string): Promise<LLMConfig | null> {
  const envKey = (process.env.LLM_API_KEY || '').trim()
  if (envKey) {
    return {
      baseUrl: (process.env.LLM_BASE_URL || LLM_DEFAULT_BASE_URL).trim(),
      apiKey: envKey,
      model: (process.env.LLM_MODEL || LLM_DEFAULT_MODEL).trim(),
    }
  }

  const row = await db.user.findUnique({
    where: { id: userId },
    select: { llmApiKey: true, llmBaseUrl: true, llmModel: true },
  })
  const key = (row?.llmApiKey || '').trim()
  if (key) {
    return {
      baseUrl: (row?.llmBaseUrl || LLM_DEFAULT_BASE_URL).trim(),
      apiKey: key,
      model: (row?.llmModel || LLM_DEFAULT_MODEL).trim(),
    }
  }

  // Local development only: the sandbox/dev machine has the z-ai config file.
  if (process.env.NODE_ENV !== 'production' && process.env.LLM_NO_LOCAL_FILE !== '1') {
    try {
      const fs = await import('fs')
      const os = await import('os')
      for (const p of [
        `${process.cwd()}/.z-ai-config`,
        `${os.homedir()}/.z-ai-config`,
        '/etc/.z-ai-config',
      ]) {
        try {
          const raw = await fs.promises.readFile(p, 'utf-8')
          const cfg = JSON.parse(raw) as { baseUrl?: string; apiKey?: string }
          if (cfg.baseUrl && cfg.apiKey) {
            return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: '' } // internal API defaults its model
          }
        } catch {
          /* try next path */
        }
      }
    } catch {
      /* no file fallback available */
    }
  }
  return null
}

function chatHeaders(cfg: LLMConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  }
  // OpenRouter attribution headers — harmless for other providers (ignored)
  if (cfg.baseUrl.includes('openrouter')) {
    headers['X-Title'] = 'Nidaa Voice Caller'
  }
  return headers
}

/** Pull one text delta out of an SSE `data:` payload (or a parsed chunk). */
function deltaText(part: unknown): string {
  const obj = part as {
    choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
  } | undefined
  return obj?.choices?.[0]?.delta?.content || obj?.choices?.[0]?.message?.content || ''
}

/**
 * Streamed chat completion against any OpenAI-compatible endpoint.
 * Yields text deltas as they arrive; throws on HTTP errors / empty streams.
 */
async function* openAIStream(cfg: LLMConfig, messages: Array<{ role: string; content: string }>): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: chatHeaders(cfg),
    body: JSON.stringify({ model: cfg.model || undefined, messages, stream: true }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`LLM HTTP ${res.status}: ${detail}`)
  }
  if (!res.body) throw new Error('LLM stream unavailable')

  const decoder = new TextDecoder()
  const reader = res.body.getReader()
  let raw = ''
  let gotAny = false
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    raw += typeof value === 'string' ? value : decoder.decode(value)
    for (;;) {
      const idx = raw.indexOf('\n')
      if (idx === -1) break
      const line = raw.slice(0, idx).trim()
      raw = raw.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const text = deltaText(JSON.parse(payload))
        if (text) {
          gotAny = true
          yield text
        }
      } catch {
        /* partial JSON — next chunk carries the rest */
      }
    }
  }
  if (!gotAny) throw new Error('Empty LLM stream')
}

/** Non-streaming completion — second-chance path when SSE fails. */
async function openAIFull(cfg: LLMConfig, messages: Array<{ role: string; content: string }>): Promise<string> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: chatHeaders(cfg),
    body: JSON.stringify({ model: cfg.model || undefined, messages, stream: false }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`LLM HTTP ${res.status}: ${detail}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const text = data?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty LLM response')
  return text
}

/** Legacy path for local dev: the z-ai SDK (config-file based). */
async function* sdkStream(messages: Array<{ role: string; content: string }>): AsyncGenerator<string, void, unknown> {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages: messages as Parameters<typeof zai.chat.completions.create>[0]['messages'],
    stream: true,
    thinking: { type: 'disabled' },
  })
  let gotAny = false
  if (completion && typeof (completion as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    for await (const part of completion as AsyncIterable<unknown>) {
      if (part && typeof part === 'object' && 'choices' in (part as object)) {
        const text = deltaText(part)
        if (text) {
          gotAny = true
          yield text
        }
        continue
      }
      const bytes = part instanceof Uint8Array ? part : null
      const rawChunk = bytes ? new TextDecoder().decode(bytes) : String(part)
      for (const line of rawChunk.split('\n')) {
        const t = line.trim()
        if (!t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const text = deltaText(JSON.parse(payload))
          if (text) {
            gotAny = true
            yield text
          }
        } catch {
          /* partial JSON */
        }
      }
    }
  }
  if (!gotAny) throw new Error('Empty SDK stream')
}

async function sdkFull(messages: Array<{ role: string; content: string }>): Promise<string> {
  const ZAI = (await import('z-ai-web-dev-sdk')).default
  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages: messages as Parameters<typeof zai.chat.completions.create>[0]['messages'],
    thinking: { type: 'disabled' },
  })
  const text = (completion as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty SDK response')
  return text
}

export type BrainMessage = { role: 'user' | 'assistant'; content: string }

/**
 * The brain: stream the assistant's reply one delta at a time.
 * Order: configured provider (stream → full) → local SDK (stream → full).
 * Throws only when EVERY attempt fails — callers decide the spoken fallback.
 */
export async function* streamBrain(messages: BrainMessage[], userId: string): AsyncGenerator<string, void, unknown> {
  const cfg = await resolveLLM(userId)
  let lastErr: unknown = null

  if (cfg) {
    for (const mode of ['stream', 'full', 'stream'] as const) {
      try {
        if (mode === 'stream') {
          for await (const delta of openAIStream(cfg, messages)) yield delta
          return
        }
        yield await openAIFull(cfg, messages)
        return
      } catch (err) {
        console.error('[llm] provider attempt failed:', err)
        lastErr = err
        await new Promise((r) => setTimeout(r, 400))
      }
    }
    // provider configured but failing — try the local SDK before giving up (dev only)
  }

  if (process.env.NODE_ENV !== 'production' && process.env.LLM_NO_LOCAL_FILE !== '1') {
    try {
      for await (const delta of sdkStream(messages)) yield delta
      return
    } catch (err) {
      lastErr = err
      try {
        yield await sdkFull(messages)
        return
      } catch (err2) {
        lastErr = err2
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('LLM failed')
}
