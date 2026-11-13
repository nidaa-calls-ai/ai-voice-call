import { NextRequest, NextResponse } from 'next/server'
import { ensureDbReady } from '@/lib/db'
import { authenticate } from '@/lib/auth'
import { resolveLLM, chatHeaders } from '@/lib/llm'

export const dynamic = 'force-dynamic'

/**
 * Live "brain check": sends a tiny non-streaming completion through the
 * account's configured OpenAI-compatible provider so the dashboard can PROVE
 * the key/model actually work — or surface the provider's real error
 * (401 invalid key / 402 credits / 404 unknown model / timeout...).
 * Same config priority as the call brain: env vars first, then the user row.
 */
export async function POST(req: NextRequest) {
  await ensureDbReady()

  let body: { token?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    /* body optional */
  }
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams }, body.token)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const cfg = await resolveLLM(user.id)
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: 'مفيش مفتاح محفوظ — اكتب مفتاح الـ API الأول واعمل حفظ' },
      { status: 400 }
    )
  }

  const t0 = Date.now()
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: chatHeaders(cfg),
      body: JSON.stringify({
        model: cfg.model || undefined,
        messages: [{ role: 'user', content: 'اختبر نفسك: رد بكلمة "تمام" واحدة بس.' }],
        max_tokens: 30,
        stream: false,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const ms = Date.now() - t0

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      return NextResponse.json({
        ok: false,
        ms,
        error: `المزوّد رد HTTP ${res.status}${detail ? `: ${detail}` : ' — راجع المفتاح أو اسم الموديل'}`,
      })
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const reply = data?.choices?.[0]?.message?.content?.trim()
    if (!reply) {
      return NextResponse.json({ ok: false, ms, error: 'المزوّد رد رد فاضي — جرّب موديل تاني' })
    }
    return NextResponse.json({ ok: true, ms, reply, model: cfg.model, baseUrl: cfg.baseUrl })
  } catch (err) {
    const ms = Date.now() - t0
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      ok: false,
      ms,
      error: /timeout|abort/i.test(msg)
        ? 'المزوّد مقدرش يرد في 20 ثانية — جرّب تاني أو غيّر الموديل'
        : msg.slice(0, 300),
    })
  }
}
