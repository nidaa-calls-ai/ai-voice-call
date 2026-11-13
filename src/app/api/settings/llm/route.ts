import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticate } from '@/lib/auth'
import { LLM_DEFAULT_BASE_URL, LLM_DEFAULT_MODEL, LLM_PRESETS } from '@/lib/llm'

export const dynamic = 'force-dynamic'

function mask(key: string): string {
  if (key.length <= 10) return '••••' + key.slice(-2)
  return key.slice(0, 6) + '••••••' + key.slice(-4)
}

/**
 * AI brain credentials (OpenAI-compatible chat endpoint) — PER ACCOUNT.
 * GET  -> configured? + masked key + current base url / model + presets
 * POST -> save { api_key?, base_url?, model? } or { reset: true }
 * The key is never returned in raw form.
 */
export async function GET(req: NextRequest) {
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { llmApiKey: true, llmBaseUrl: true, llmModel: true },
  })
  return NextResponse.json({
    ok: true,
    configured: !!row?.llmApiKey,
    apiKeyMasked: row?.llmApiKey ? mask(row.llmApiKey) : null,
    baseUrl: row?.llmBaseUrl || LLM_DEFAULT_BASE_URL,
    model: row?.llmModel || LLM_DEFAULT_MODEL,
    presets: LLM_PRESETS,
  })
}

export async function POST(req: NextRequest) {
  try {
    let body: { api_key?: string; base_url?: string; model?: string; reset?: boolean; token?: string } = {}
    try {
      body = (await req.json()) as typeof body
    } catch {
      /* handled below */
    }
    const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams }, body.token)
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (body.reset) {
      await db.user.update({
        where: { id: user.id },
        data: { llmApiKey: null, llmBaseUrl: null, llmModel: null },
      })
      return NextResponse.json({ ok: true, configured: false, apiKeyMasked: null, baseUrl: LLM_DEFAULT_BASE_URL, model: LLM_DEFAULT_MODEL })
    }

    const apiKey = (body.api_key || '').trim()
    const baseUrl = (body.base_url || '').trim()
    const model = (body.model || '').trim()

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'اكتب مفتاح الـ API الأول' }, { status: 400 })
    }
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
      return NextResponse.json({ ok: false, error: 'الـ Base URL لازم يبدأ بـ http:// أو https://' }, { status: 400 })
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        llmApiKey: apiKey,
        llmBaseUrl: baseUrl || LLM_DEFAULT_BASE_URL,
        llmModel: model || LLM_DEFAULT_MODEL,
      },
    })

    return NextResponse.json({ ok: true, configured: true, apiKeyMasked: mask(apiKey), baseUrl: baseUrl || LLM_DEFAULT_BASE_URL, model: model || LLM_DEFAULT_MODEL })
  } catch (err) {
    console.error('[settings/llm] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
