import { NextRequest, NextResponse } from 'next/server'
import { createCall } from '@/lib/calls'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Trigger a demo/test call from the dashboard button — for the signed-in user. */
export async function POST(req: NextRequest) {
  const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const call = await createCall({
      userId: user.id,
      source: 'test',
      taskName: 'مكالمة تجريبية — فحص البريد الإلكتروني',
      summary: 'خلصت فحص البريد الإلكتروني زي كل يوم، والحمد لله كل حاجة تمام.',
      result: 'لقيت 5 رسايل جديدة: رسالة من المدير بتطلب التقرير قبل الساعة 5، ورسالتين من فريق الدعم عن تذكرة العميل أحمد، و42 رسالة سبام اتمسحت أوتوماتيك. مفيش حاجة مستعجلة غير تقرير المدير.',
      message: 'لو بتحاورني دلوقتي يبقى كل حاجة تمام — اسألني عن التفاصيل!',
      urgency: 'normal',
    })
    return NextResponse.json({ ok: true, call_id: call.id, status: call.status })
  } catch (err) {
    console.error('[test-call] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
