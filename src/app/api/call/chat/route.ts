import { NextRequest } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { appendTranscript, getUserCall, parseTranscript } from '@/lib/calls'
import { authenticate } from '@/lib/auth'
import { getOwnerVoice, synthesizeSentence } from '@/lib/call-voice'

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
    '9. لو كلام المستخدم وصلك ناقص أو مش واضح، متقولش "صوتك قطع" ولا تطلب منه يكرر كتير — جاوب بقدر اللي وصلتلك وكمّل الحوار طبيعي.',
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

type ChatMsg = { role: 'user' | 'assistant'; content: string }

/** Pull the text delta out of one SSE `data:` payload (or a parsed chunk object). */
function chunkText(part: unknown): string {
  const obj = part as {
    choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>
  } | undefined
  return obj?.choices?.[0]?.delta?.content || obj?.choices?.[0]?.message?.content || ''
}

/**
 * Ask the LLM, streaming sentence chunks as they are produced.
 * The z-ai SDK returns the stream as raw SSE bytes (a Readable of Buffers with
 * "data: {...}" lines) — we parse SSE ourselves. Defensive fallbacks:
 *   attempt 1: streaming (SSE parsed)
 *   attempt 2: full non-streaming completion
 *   attempt 3: streaming again
 */
async function* streamLLM(messages: ChatMsg[]): AsyncGenerator<string, void, unknown> {
  const zai = await ZAI.create()
  let lastErr: unknown = null
  for (const mode of ['stream', 'full', 'stream'] as const) {
    try {
      if (mode === 'stream') {
        const completion = await zai.chat.completions.create({
          messages,
          stream: true,
          thinking: { type: 'disabled' },
        })
        let gotAny = false
        if (completion && typeof completion[Symbol.asyncIterator] === 'function') {
          let raw = ''
          const flushLine = (line: string): string | null => {
            const t = line.trim()
            if (!t.startsWith('data:')) return null
            const payload = t.slice(5).trim()
            if (!payload || payload === '[DONE]') return null
            try {
              return chunkText(JSON.parse(payload)) || null
            } catch {
              return null // partial JSON — dropped, next chunk carries the rest
            }
          }
          for await (const part of completion as AsyncIterable<unknown>) {
            // chunk may be a Buffer of SSE bytes OR an already-parsed object
            if (part && typeof part === 'object' && 'choices' in (part as object)) {
              const text = chunkText(part)
              if (text) {
                gotAny = true
                yield text
              }
              continue
            }
            const bytes =
              part instanceof Uint8Array ? part : typeof (part as { buffer?: unknown })?.buffer === 'object' ? new Uint8Array((part as unknown as ArrayBufferLike).buffer || part as unknown as ArrayBuffer) : null
            raw += bytes ? new TextDecoder().decode(bytes) : String(part)
            for (;;) {
              const idx = raw.indexOf('\n')
              if (idx === -1) break
              const text = flushLine(raw.slice(0, idx))
              raw = raw.slice(idx + 1)
              if (text) {
                gotAny = true
                yield text
              }
            }
          }
          // remaining buffered line(s) at stream end
          for (const line of raw.split('\n')) {
            const text = flushLine(line)
            if (text) {
              gotAny = true
              yield text
            }
          }
        }
        if (gotAny) return
        lastErr = new Error('Empty LLM stream')
      } else {
        // non-streaming shape -> emit the whole reply at once
        const completion = await zai.chat.completions.create({
          messages,
          thinking: { type: 'disabled' },
        })
        const text = (completion as { choices?: Array<{ message?: { content?: string } }> })
          ?.choices?.[0]?.message?.content?.trim()
        if (!text) throw new Error('Empty LLM response')
        yield text
        return
      }
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM failed')
}

function fallbackGreeting(call: { taskName: string; summary: string | null; result: string | null }): string {
  const pieces = [`أهلاً! كلمني مساعدك نداء. المهمة "${call.taskName}" خلصت فعلاً.`]
  if (call.summary) pieces.push(call.summary)
  if (call.result) pieces.push(`والنتيجة: ${call.result}`)
  pieces.push('عايز تفاصيل أكتر ولا كده تمام؟')
  return pieces.join(' ')
}

/** Honest fallback when OUR brain fails — never blames the user's voice. */
const SOFT_FALLBACK = 'لحظة، الشبكة وقفت معايا ثانية — كمّل كلامك وأنا معاك.'

// ---------------------------------------------------------------------------
// Sentence streaming helpers
// ---------------------------------------------------------------------------

/** Pull complete sentences (ending with . ! ? ؟) out of the buffer. */
function extractSentences(buffer: string, flush: boolean): { sentences: string[]; rest: string } {
  const sentences: string[] = []
  let rest = buffer
  // Arabic + latin sentence ends followed by whitespace
  const re = /(.+?[.!?؟])(\s+|$)/g
  let match: RegExpExecArray | null
  let consumed = 0
  while ((match = re.exec(rest)) !== null) {
    const s = match[1].trim()
    if (s.length >= 2) sentences.push(s)
    consumed = match.index + match[0].length
  }
  rest = rest.slice(consumed)
  // force-flush an overlong tail so the user hears something quickly
  if (flush && rest.trim()) {
    if (rest.trim().length >= 2) sentences.push(rest.trim())
    rest = ''
  } else if (rest.length > 220) {
    const cut = rest.lastIndexOf(' ', 220)
    const s = rest.slice(0, cut > 40 ? cut : 220).trim()
    if (s) sentences.push(s)
    rest = rest.slice(cut > 40 ? cut : 220)
  }
  return { sentences, rest }
}

/**
 * Voice-call brain: one turn of the live conversation.
 * POST { callId, text, agentMessage? }  (text === "" && !agentMessage -> opening report)
 *
 * With `Accept: application/x-ndjson` the reply streams as NDJSON so the phone
 * starts SPEAKING the first sentence while the rest is still being generated
 * (live-call feel instead of waiting for the whole LLM + TTS round-trip):
 *   {"type":"audio","seq":0,"mime":"audio/mpeg","audio":"<base64>","voice":"fish-audio"}
 *   ...
 *   {"type":"done","reply":"<full reply text>","voice":"fish-audio"}
 * Plain JSON clients (Accept: application/json) get the legacy {ok, reply}.
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
      return jsonError(401, 'Unauthorized')
    }

    const callId = (body.callId || '').trim()
    const userText = (body.text || '').trim()

    if (!callId) {
      return jsonError(400, 'callId is required')
    }

    const call = await getUserCall(callId, user.id)
    if (!call) {
      return jsonError(404, 'Call not found')
    }

    // Build conversation history from stored transcript (max 16 turns).
    // 'agent' turns (live updates pushed by GPT/Claude via send_call_update) are
    // included as context so the assistant knows what was already announced.
    let history: ChatMsg[] = []
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

    const messages: ChatMsg[] = [
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
        return jsonError(400, 'agentMessage too long (max 600)')
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
        return jsonError(400, 'Text too long')
      }
      messages.push({ role: 'user', content: userText })
    }

    const wantsStream = (req.headers.get('accept') || '').includes('ndjson')
    const owner = await getOwnerVoice(user.id)

    const finalize = async (reply: string): Promise<{ ok: true; reply: string }> => {
      // Persist both sides of the conversation (agent updates are already stored)
      if (!isIntro && !agentMessage) await appendTranscript(callId, 'user', userText)
      if (reply.trim()) await appendTranscript(callId, 'assistant', reply)
      return { ok: true, reply }
    }

    // ---------------- legacy JSON mode ----------------
    if (!wantsStream) {
      let reply = ''
      try {
        for await (const chunk of streamLLM(messages)) reply += chunk
      } catch (err) {
        console.error('[call/chat] LLM error:', err)
        reply = isIntro
          ? fallbackGreeting({ taskName: call.taskName, summary: call.summary, result: call.result })
          : agentMessage
            ? agentMessage
            : SOFT_FALLBACK
      }
      const result = await finalize(reply.trim())
      return Response.json(result)
    }

    // ---------------- streaming NDJSON mode ----------------
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        const send = (obj: Record<string, unknown>) => {
          if (closed) return
          try {
            controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'))
          } catch {
            closed = true
          }
        }

        let reply = ''
        let playedAny = false
        let voiceUsed: string | null = null
        let seq = 0
        try {
          let buffer = ''
          for await (const delta of streamLLM(messages)) {
            reply += delta
            buffer += delta
            const { sentences, rest } = extractSentences(buffer, false)
            buffer = rest
            for (const sentence of sentences) {
              const synth = await synthesizeSentence(sentence, owner)
              playedAny = true
              voiceUsed = synth.voice
              send({ type: 'audio', seq: seq++, mime: synth.mime, voice: synth.voice, audio: synth.audio.toString('base64') })
            }
          }
          const tail = extractSentences(buffer, true)
          for (const sentence of tail.sentences) {
            const synth = await synthesizeSentence(sentence, owner)
            playedAny = true
            voiceUsed = synth.voice
            send({ type: 'audio', seq: seq++, mime: synth.mime, voice: synth.voice, audio: synth.audio.toString('base64') })
          }
        } catch (err) {
          console.error('[call/chat] stream error:', err)
          if (!playedAny) {
            // the brain failed before saying anything -> honest fallback, spoken too
            reply = isIntro
              ? fallbackGreeting({ taskName: call.taskName, summary: call.summary, result: call.result })
              : agentMessage
                ? agentMessage
                : SOFT_FALLBACK
            try {
              const synth = await synthesizeSentence(reply, owner)
              playedAny = true
              voiceUsed = synth.voice
              send({ type: 'audio', seq: seq++, mime: synth.mime, voice: synth.voice, audio: synth.audio.toString('base64') })
            } catch {
              /* no audio at all -> client falls back to browser TTS with the done reply */
            }
          }
        }

        send({ type: 'done', reply: reply.trim(), voice: voiceUsed, hasAudio: playedAny })
        try {
          await finalize(reply.trim())
        } catch (err) {
          console.error('[call/chat] persist failed:', err)
        }
        closed = true
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('[call/chat] error:', err)
    return jsonError(500, 'Internal error')
  }
}

function jsonError(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status })
}
