import { NextRequest, NextResponse } from 'next/server'
import { createCall } from '@/lib/calls'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/** Self-documenting usage endpoint. */
export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/notify?token=<your-personal-access-token>',
    description: 'يبعت مكالمة صوتية حية لموبايل صاحب الحساب لما أي مهمة أو أداة خارجية تخلص — بدون MCP. التوكن الشخصي بتاع كل حساب بتلاقيه في لوحة التحكم.',
    body_example: {
      task_name: 'فحص البريد الإلكتروني',
      summary: 'لقيت 3 رسايل جديدة مهمة من فريق العمل',
      result: 'رسالة من المدير بتطلب التقرير قبل ٥، ورسالتين من فريق الدعم، و٤٢ رسالة سبام اتمسحت',
      message: 'رسالة إضافية اختيارية هيتقالها المساعد في المكالمة',
      urgency: 'normal',
    },
    urgency_values: ['low', 'normal', 'high'],
  })
}

export async function POST(req: NextRequest) {
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized: invalid or missing token — use your personal access token from the dashboard' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  try {
    const body = (await req.json()) as {
      task_name?: string
      summary?: string
      result?: string
      message?: string
      urgency?: string
    }
    const taskName = (body.task_name || '').trim()
    if (!taskName) {
      return NextResponse.json({ ok: false, error: 'task_name is required' }, { status: 400, headers: CORS_HEADERS })
    }

    const call = await createCall({
      userId: user.id,
      source: 'rest',
      taskName,
      summary: (body.summary || '').trim() || null,
      result: (body.result || '').trim() || null,
      message: (body.message || '').trim() || null,
      urgency: body.urgency || 'normal',
    })

    return NextResponse.json(
      { ok: true, call_id: call.id, status: call.status, message: 'تم بدء الرنين على موبايل المستخدم' },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[notify] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500, headers: CORS_HEADERS })
  }
}
