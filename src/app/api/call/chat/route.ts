import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { appendTranscript, getUserCall, parseTranscript } from '@/lib/calls'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type TranscriptTurn = { role: string; text: string; at: string }
// (kept for typing of external callers; parsing now goes through parseTranscript)

function buildSystemPrompt(call: {
  taskName: string
  summary: string | null
  result: string | null
  message: string | null
  urgency: string
}): string {
  const urgencyText = call.urgency === 'high' ? 'عالية جداً (مهمة مستعجلة)' : call.urgency === 'low' ? 'عادية' : 'متوسطة'
  const facts: string[] = [`- المهمة: ${call.taskName}`]
  if (call.summary) facts.push(`- الملخص: ${call.summary}`)
  if (call.result) facts.push(`- النتيجة الفعلية (أرقام وبيانات حقيقية من التنفيذ): ${call.result}`)
  if (call.message) facts.push(`- رسالة إضافية من الإيجنت: ${call.message}`)
  facts.push(`- درجة الاستعجال: ${urgencyText}`)

  const rules: string[] = [
    'قواعد صارمة لازم تلتزم بيها:',
    '1. اتكلم عربي مصري بسيط ودافي، زي ما شخص حقيقي بيتكلم على التليفون.',
    '2. ردودك هتتحول لصوت يتعلى بالسماعة — فاكتب جمل قصيرة واضحة، من غير رموز ولا إيموجي ولا نجوم ولا ماركداون ولا أقواس.',
    '3. خلي كل رد من سطر لسطرين كحد أقصى عشان المكالمة تبقى طبيعية.',
    '4. إنت بتحكي تقرير مش بتقرا ورق: ارتب الكلام كإنك شخص فاهم اللي حصل وبيحكيه، ولو فيه أرقام أو نتائج في النتيجة الفعلية قولها بشكل طبيعي وواضح.',
    '5. لو المستخدم سأل عن تفاصيل جاوب من الملخص والنتيجة الفعلية، ولو المعلومة مش موجودة قول بصراحة إنها مش عندك وإن الإيجنت اللي عمل المهمة هو مصدرها، واعرض عليه إن الإشعار الجاي يبعت تفاصيل أوفر.',
    '6. ممكن تجاوب على أي سؤال عام برضه، بس ركّز على موضوع المكالمة الأول وارجّع الحوار للتقرير.',
    '7. لو المستخدم قال خلاص أو شكراً أو السلام عليكم أو وضّح إنه مش محتاج حاجة تانية، ودّعه بجملة قصيرة مؤدبة.',
    '8. متستخدمش جمل طويلة معقدة ولا أرقام عشرية — اكتب الأرقام بشكل بسيط مفهوم لصوتي.',
  ]

  return [
    'إنت اسمك "نداء"، مساعد صوتي ذكي شخصي. إنت دلوقتي في مكالمة صوتية حية مع المستخدم، والمكالمة دي بتبدأ عشان نظام أوتوماتيكي (إيجنت MCP) خلص مهمة فعلاً وعايز يبلّغه بالتقرير صوتياً بدل ما يفتح التطبيق بنفسه.',
    '',
    'إيه اللي اتعمل فعلاً (ده ملزَم ومصدر الحقيقة الوحيد في المكالمة):',
    ...facts,
    '',
    ...rules,
  ].join('\n')
}

async function askLLM(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: 'disabled' },
  })
  const reply = completion.choices[0]?.message?.content?.trim()
  if (!reply) throw new Error('Empty LLM response')
  return reply
}

function fallbackGreeting(call: { taskName: string; summary: string | null; result: string | null }): string {
  const pieces = [`أهلاً! كلمني مساعدك نداء. المهمة "${call.taskName}" خلصت فعلاً.`]
  if (call.summary) pieces.push(call.summary)
  if (call.result) pieces.push(`والنتيجة: ${call.result}`)
  pieces.push('عايز تفاصيل أكتر ولا كده تمام؟')
  return pieces.join(' ')
}

/**
 * Voice-call brain: one turn of the live conversation.
 * POST { callId, text }  (text === "" means "open the call with a factual report")
 */
export async function POST(req: NextRequest) {
  try {
    // every call belongs to one account — the phone must be signed in to that account
    let body: { callId?: string; text?: string; agentMessage?: string; token?: string } = {}
    try {
      body = (await req.json()) as typeof body
    } catch {
      /* handled below */
    }
    const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams }, body.token)
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const callId = (body.callId || '').trim()
    const userText = (body.text || '').trim()

    if (!callId) {
      return NextResponse.json({ ok: false, error: 'callId is required' }, { status: 400 })
    }

    const call = await getUserCall(callId, user.id)
    if (!call) {
      return NextResponse.json({ ok: false, error: 'Call not found' }, { status: 404 })
    }

    // Build conversation history from stored transcript (max 16 turns).
    // 'agent' turns (live updates pushed by GPT/Claude via send_call_update) are
    // included as context so the assistant knows what was already announced.
    let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (call.transcript) {
      const parsed = parseTranscript(call.transcript)
      history = parsed
        .slice(-16)
        .filter((t) => t.role === 'user' || t.role === 'assistant' || t.role === 'agent')
        .map((t) =>
          t.role === 'agent'
            ? { role: 'user' as const, content: `[تحديث من الإيجنت اللي شغال في الخلفية — ده مش كلام المستخدم]: ${t.text}` }
            : { role: (t.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: t.text }
        )
    }

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'assistant',
        content: buildSystemPrompt({
          taskName: call.taskName,
          summary: call.summary,
          result: call.result,
          message: call.message,
          urgency: call.urgency,
        }),
      },
      ...history,
    ]

    // agentMessage: the external agent (GPT/Claude) pushed a live update via
    // send_call_update — the phone relays it here so the assistant announces it
    // naturally, out loud, mid-call. It is already stored in the transcript.
    const agentMessage = (body.agentMessage || '').trim()
    const isIntro = userText.length === 0 && !agentMessage
    if (isIntro) {
      messages.push({
        role: 'user',
        content:
          'المستخدم رد على المكالمة دلوقتي وبيسمعك لأول مرة. ابدأ بتقرير فعلي مش ترحيب عام، بالترتيب ده في جملة لجملتين: ' +
          'أولاً قول إن المهمة خلصت فعلاً واشرح بإيجاز إيه اللي اتعمل. ' +
          'ثانياً اذكر أهم نتيجة حقيقية من النتيجة الفعلية لو متوفرة، بأرقام أو تفاصيل واضحة. ' +
          'ثالثاً اقفل بسؤال قصير: محتاج تفاصيل أكتر ولا كده كويس؟ ' +
          'متبتدأش بكلام إنشائي ولا "أهلاً وسهلاً"، ادخل في المعلومة على طول بأسلوب طبيعي.',
      })
    } else if (agentMessage) {
      if (agentMessage.length > 600) {
        return NextResponse.json({ ok: false, error: 'agentMessage too long (max 600)' }, { status: 400 })
      }
      messages.push({
        role: 'user',
        content:
          `الإيجنت اللي واقف بره وبيولّع على المهمة بعتلك تحديث جديد دلوقتي، وده قاله بالحرف: "${agentMessage}"\n\n` +
          'المطلوب منك حالاً: بلّغ المستخدم بالتحديث ده صوتياً بنفسك — في جملة لجملتين بأسلوبك المصري الطبيعي، كإنك عارف الخبر مش بتقرا تليجرام. ' +
          'اذكر أي أرقام أو نتائج موجودة في التحديث زي ما هي، ولو فيه حاجة اتعملت كان المستخدم طلبها قول "خلاص اتعملت" بوضوح. ' +
          'متستخدمش كلمات زي "رسالة" أو "نص" أو "الإيجنت بعت" — احكي الخبر على طول، وفي الآخر اسأله لو عايز حاجة تانية.',
      })
    } else {
      if (userText.length > 800) {
        return NextResponse.json({ ok: false, error: 'Text too long' }, { status: 400 })
      }
      messages.push({ role: 'user', content: userText })
    }

    let reply: string
    try {
      reply = await askLLM(messages)
    } catch (err) {
      console.error('[call/chat] LLM error:', err)
      reply = isIntro
        ? fallbackGreeting({ taskName: call.taskName, summary: call.summary, result: call.result })
        : agentMessage
          ? agentMessage
          : 'عذراً، صوتي قطع شوية. ممكن تكرر تاني؟'
    }

    // Persist both sides of the conversation (agent updates are already stored)
    if (!isIntro && !agentMessage) await appendTranscript(callId, 'user', userText)
    await appendTranscript(callId, 'assistant', reply)

    return NextResponse.json({ ok: true, reply })
  } catch (err) {
    console.error('[call/chat] error:', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
