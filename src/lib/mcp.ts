import { NextResponse } from 'next/server'
import { createCall, listUserCalls, getUserCall, parseTranscript, pushAgentUpdate, reapStaleRingingCalls } from '@/lib/calls'
import type { SafeUser } from '@/lib/auth'

/**
 * MCP (Model Context Protocol) server over Streamable HTTP (stateless, JSON responses).
 * Speaks JSON-RPC 2.0: initialize / tools/list / tools/call / ping.
 * Auth: Authorization: Bearer <token>  or  ?token=<token>
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18'
export const SERVER_INFO = { name: 'nidaa-voice-caller', title: 'نداء — Voice Caller', version: '1.0.0' }

type JsonRpcId = string | number | null
type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

function jsonResponse(id: JsonRpcId, result: unknown): NextResponse {
  return NextResponse.json(
    { jsonrpc: '2.0', id, result },
    { headers: { 'Access-Control-Allow-Origin': '*', 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION } }
  )
}

function errorResponse(id: JsonRpcId, code: number, message: string): NextResponse {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  )
}

// ---------------------------------------------------------------------------
// Tool definitions (MCP tools/list payload)
// ---------------------------------------------------------------------------

const NOTIFY_TASK_COMPLETE_TOOL = {
  name: 'notify_task_complete',
  title: 'إبلاغ انتهاء مهمة بمكالمة صوتية (وافتح جلسة حية)',
  description:
    'Call the user with a real live voice call (ringing + AI assistant speaking Egyptian Arabic) to notify them that a task or scheduled job has finished. ' +
    'Use this tool immediately after completing any long-running or scheduled task (e.g. checking email, scraping data, monitoring) instead of waiting for the user to open the app. ' +
    'IMPORTANT: this opens a LIVE SESSION, not a fire-and-forget notification. Keep the returned call_id and immediately start looping wait_for_call_updates: ' +
    'you will hear everything the user says mid-call, execute any request they make (e.g. "reply to that email"), and push results back into the call with send_call_update. ' +
    'The call stays open until the USER hangs up — never abandon it while status is still answered.',
  inputSchema: {
    type: 'object',
    properties: {
      task_name: {
        type: 'string',
        description: 'Short Arabic name of the finished task, e.g. "فحص البريد الإلكتروني"',
      },
      summary: {
        type: 'string',
        description: 'Arabic summary of what happened, spoken out loud to the user. Keep it short and conversational.',
      },
      result: {
        type: 'string',
        description:
          'Arabic description of the ACTUAL outcome/data produced by the task (numbers, names, statuses, key findings). ' +
          'The voice assistant uses this to report exactly what was done and to answer the user follow-up questions during the call. Be concrete and factual.',
      },
      message: {
        type: 'string',
        description: 'Optional extra Arabic message/details for the assistant to share during the call.',
      },
      urgency: {
        type: 'string',
        enum: ['low', 'normal', 'high'],
        description: 'How urgent the notification is. Default: normal',
      },
    },
    required: ['task_name'],
  },
}

const WAIT_FOR_CALL_UPDATES_TOOL = {
  name: 'wait_for_call_updates',
  title: 'استمع حياً للمستخدم داخل المكالمة (long-poll)',
  description:
    'LONG-POLL the live voice call. Call it in a LOOP right after notify_task_complete and keep looping while the call is active. ' +
    'Each call waits up to ~20 seconds and returns: the live call status, everything NEW the user said during the call (transcribed), and any agent updates already sent. ' +
    'When the user asks you to DO something (reply to an email, reschedule, fetch data), do it immediately, push the result into the call with send_call_update, then loop again. ' +
    'Keep looping until ended=true — that only happens when the USER hangs up. This is how you have a real-time two-way voice conversation from inside GPT/Claude.',
  inputSchema: {
    type: 'object',
    properties: {
      call_id: { type: 'string', description: 'The call_id returned by notify_task_complete' },
      since_turn: {
        type: 'number',
        description: 'Only return turns with index >= since_turn. Pass next_index from the previous response (default 0 = everything so far).',
      },
      timeout_sec: { type: 'number', description: 'How long to wait for new activity before returning, 5-25 seconds (default 20).' },
    },
    required: ['call_id'],
  },
}

const SEND_CALL_UPDATE_TOOL = {
  name: 'send_call_update',
  title: 'ابعت تحديث حي بصوت المساعد جوه المكالمة',
  description:
    'Push a live message INTO the ongoing voice call: the AI assistant immediately speaks it out loud to the user in Egyptian Arabic, mid-call. ' +
    'Use it while the call is active (while looping wait_for_call_updates) whenever you finish work the user asked for during the call ' +
    '(e.g. "I replied to the email", "the report is ready", new numbers found) or whenever you have new data to report. ' +
    'Keep the message short, factual, Arabic, spoken-style (it gets converted to speech).',
  inputSchema: {
    type: 'object',
    properties: {
      call_id: { type: 'string', description: 'The call_id returned by notify_task_complete' },
      message: {
        type: 'string',
        description: 'Arabic message the assistant will speak mid-call, e.g. "خلاص، رديت على إيميل المدير وقلتله إن التقرير هيوصل بكرة"',
      },
    },
    required: ['call_id', 'message'],
  },
}

const GET_CALL_HISTORY_TOOL = {
  name: 'get_call_history',
  title: 'سجل مكالمات التنبيه',
  description: 'List recent voice notification calls and their status (answered / missed / declined / completed) so you can check whether the user was reached.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max number of calls to return (default 10, max 50)' },
    },
  },
}

function statusArabic(status: string): string {
  switch (status) {
    case 'ringing':
      return 'بتنال (رنين)'
    case 'answered':
      return 'تم الرد'
    case 'completed':
      return 'خلصت واتقفلت'
    case 'declined':
      return 'تم رفضها'
    case 'missed':
      return 'فاتت بدون رد'
    default:
      return status
  }
}

const ACTIVE_STATUSES = ['ringing', 'answered']

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Build the wait_for_call_updates JSON payload from a live call record. */
function buildWaitPayload(call: NonNullable<Awaited<ReturnType<typeof getUserCall>>>, since: number, timedOut: boolean): Record<string, unknown> {
  const turns = parseTranscript(call.transcript)
  const newTurns = turns.filter((t) => t.index >= since)
  const ended = !ACTIVE_STATUSES.includes(call.status)
  return {
    call_id: call.id,
    call_status: call.status,
    call_status_arabic: statusArabic(call.status),
    ended,
    timed_out: timedOut,
    new_turns: newTurns,
    next_index: turns.length,
    hint: ended
      ? 'المكالمة اتقفلت من المستخدم — كده انتهت الجلسة الحية وانت تقدر تقفل ردك دلوقتي (لو فيه تنفيذ معلق مش هيبقى في مكالمة، اكمله عادي بعد كده).'
      : newTurns.some((t) => t.role === 'user')
        ? 'فيه كلام جديد من المستخدم أعلاه (new_turns) — نفذ أي طلب طلبه حالاً، وبعت النتيجة جوه نفس المكالمة بـ send_call_update، وبعدين لف تاني على wait_for_call_updates. متقفلش ردك ما دامت المكالمة شغالة.'
        : 'مفيش كلام جديد لسه — المكالمة لسه شغالة. كمّل اللف على wait_for_call_updates (بنفس since_turn لو مفيش جديد، أو next_index لو اتجاب كلام جديد).',
  }
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeTool(user: SafeUser, name: string, args: Record<string, unknown>): Promise<{ content: string; isError?: boolean }> {
  if (name === 'notify_task_complete') {
    const taskName = typeof args.task_name === 'string' && args.task_name.trim() ? args.task_name.trim() : ''
    if (!taskName) {
      return { content: 'خطأ: لازم تبعت task_name (اسم المهمة) عشان أقدر أعمل المكالمة.', isError: true }
    }
    const summary = typeof args.summary === 'string' ? args.summary.trim() : null
    const result = typeof args.result === 'string' ? args.result.trim() : null
    const message = typeof args.message === 'string' ? args.message.trim() : null
    const urgency = typeof args.urgency === 'string' ? args.urgency : 'normal'

    const call = await createCall({
      userId: user.id,
      source: 'mcp',
      taskName,
      summary,
      result,
      message,
      urgency,
    })

    const lines = [
      `تم بدء مكالمة صوتية حية للمستخدم الآن بخصوص مهمة "${taskName}".`,
      summary ? `الملخص اللي هيتقال للمستخدم بصوت المساعد: ${summary}` : null,
      result ? `النتيجة الفعلية اللي المساعد هيبلغها ويرد بيها على أسئلة المستخدم: ${result}` : null,
      `حالة المكالمة: رنين — لو المستخدم رد هيكلمه مساعد صوتي بالعربي المصري ويقرا التقرير ويرد على أسئلته.`,
      `call_id: ${call.id} | الحالة الحالية: ${statusArabic(call.status)}`,
      `مهم جداً: ده مش إشعار عادي — دي جلسة حية. لازم تبدأ فوراً حلقة على wait_for_call_updates بنفس الـ call_id ده: هتسمع كلام المستخدم أثناء المكالمة، تنفذ أي طلب يطلبه (زي رد على إيميل)، وترجع تبلغه بنفس المكالمة بـ send_call_update، وتفضل تعيد الدورة لحد ما ended=true (يعني هو هو اللي قفل المكالمة). متقفلش ردك ما دامت المكالمة شغالة.`,
      `معلومة: لو التطبيق مقفول على موبايله هيوصله إشعار Web Push بيفتح شاشة المكالمة بضغطة واحدة، والمكالمة عمرها ما بتتقفل من عندك — بس المستخدم اللي بيقفلها.`,
    ].filter(Boolean)
    return { content: lines.join('\n') }
  }

  if (name === 'wait_for_call_updates') {
    const callId = typeof args.call_id === 'string' ? args.call_id.trim() : ''
    if (!callId) {
      return { content: 'خطأ: لازم تبعت call_id اللي راجع من notify_task_complete.', isError: true }
    }
    // serverless safety net: close stale "ringing" calls nobody answered (the socket
    // mini-service missed-timer may not exist, e.g. on Vercel)
    await reapStaleRingingCalls(user.id)
    const since = Math.max(0, Math.floor(Number(args.since_turn) || 0))
    const timeoutSec = Math.min(Math.max(Number(args.timeout_sec) || 20, 3), 25)

    let call = await getUserCall(callId, user.id)
    if (!call) {
      return { content: `خطأ: مفيش مكالمة بالـ ID ده: ${callId} (أو مش من مكالماتك).`, isError: true }
    }

    // long-poll: return as soon as there is new activity, the call ends, or the timeout hits
    let payload = buildWaitPayload(call, since, false)
    const deadline = Date.now() + timeoutSec * 1000
    while (!payload.ended && payload.new_turns.length === 0 && Date.now() < deadline) {
      await sleep(1200)
      const fresh = await getUserCall(callId, user.id)
      if (!fresh) {
        return { content: `خطأ: المكالمة ${callId} اختفت من قاعدة البيانات.`, isError: true }
      }
      payload = buildWaitPayload(fresh, since, false)
    }
    if (!payload.ended && payload.new_turns.length === 0) {
      const fresh = await getUserCall(callId, user.id)
      if (fresh) payload = buildWaitPayload(fresh, since, true)
    }
    return { content: JSON.stringify(payload, null, 2) }
  }

  if (name === 'send_call_update') {
    const callId = typeof args.call_id === 'string' ? args.call_id.trim() : ''
    const message = typeof args.message === 'string' ? args.message.trim() : ''
    if (!callId || !message) {
      return { content: 'خطأ: لازم تبعت call_id و message (الرسالة اللي المساعد هيتقالها للمستخدم).', isError: true }
    }
    if (message.length > 600) {
      return { content: 'الرسالة أطول من 600 حرف — هتتحول لصوت، فخليها قصيرة وواضحة (سطر لسطرين).', isError: true }
    }
    const call = await getUserCall(callId, user.id)
    if (!call) {
      return { content: `خطأ: مفيش مكالمة بالـ ID ده: ${callId} (أو مش من مكالماتك).`, isError: true }
    }
    if (!ACTIVE_STATUSES.includes(call.status)) {
      return {
        content: `المكالمة دي مش شغالة دلوقتي (حالتها: ${statusArabic(call.status)}) — مش هينفع تبعت تحديث جواها. لو محتاج تبلغ بحاجة جديدة اعمل مكالمة جديدة بـ notify_task_complete.`,
        isError: true,
      }
    }
    const { index, status } = await pushAgentUpdate(callId, message)
    return {
      content: JSON.stringify(
        {
          ok: true,
          call_id: callId,
          message,
          turn_index: index,
          call_status: status,
          note:
            status === 'ringing'
              ? 'المستخدم لسه ماردش على الرنين — التحديث اتخزن وهيسمعه فور ما يرد. كمّل اللف على wait_for_call_updates.'
              : 'التحديث وصل المكالمة والمساعد هيتقاله للمستخدم بصوت عالي دلوقتي. كمّل الاستماع على كلام المستخدم الجديد بـ wait_for_call_updates.',
        },
        null,
        2
      ),
    }
  }

  if (name === 'get_call_history') {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50)
    const calls = await listUserCalls(user.id, limit)
    if (calls.length === 0) {
      return { content: 'لسه مفيش أي مكالمات مسجلة.' }
    }
    const lines = calls.map((c) => {
      const time = new Date(c.createdAt).toLocaleString('ar-EG')
      return `- [${time}] "${c.taskName}" (${c.source}) — الحالة: ${statusArabic(c.status)}${c.durationSec ? ` — المدة: ${c.durationSec} ثانية` : ''}`
    })
    return { content: `آخر ${calls.length} مكالمة:\n${lines.join('\n')}` }
  }

  return { content: `أداة غير معروفة: ${name}`, isError: true }
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

export async function handleMcpPost(body: unknown, user: SafeUser): Promise<NextResponse> {
  const req = body as JsonRpcRequest
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return errorResponse(null, -32600, 'Invalid JSON-RPC 2.0 request')
  }

  const isNotification = req.id === undefined || req.id === null
  const id = (req.id ?? null) as JsonRpcId
  const params = (req.params ?? {}) as Record<string, unknown>

  switch (req.method) {
    case 'initialize': {
      return jsonResponse(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions:
          'استخدم أداة notify_task_complete فور انتهاء أي مهمة أو عمل مجدول عشان المستخدم يستلم مكالمة صوتية بالملخص. ' +
          'المكالمة دي جلسة حية، مش إشعار: بعد ما تاخد call_id لفّ على wait_for_call_updates لحد ما المكالمة تخلص، وساعتها هتسمع كل كلام المستخدم جوه المكالمة. ' +
          'نفذ أي طلب المستخدم يطلبه أثناء المكالمة (زي الرد على إيميل) وبعت النتيجة فوراً بـ send_call_update فهيتقال له بصوت المساعد في نفس اللحظة. ' +
          'المكالمة عمرها ما بتتقفل منك — بس لما المستخدم نفسه يقفلها (ended=true)، وساعتها بس تقفل ردك.',
      })
    }

    case 'notifications/initialized':
    case 'notifications/cancelled': {
      // Notifications get no response body
      return new NextResponse(null, { status: 202, headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    case 'ping': {
      return jsonResponse(id, {})
    }

    case 'tools/list': {
      return jsonResponse(id, {
        tools: [NOTIFY_TASK_COMPLETE_TOOL, WAIT_FOR_CALL_UPDATES_TOOL, SEND_CALL_UPDATE_TOOL, GET_CALL_HISTORY_TOOL],
      })
    }

    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : ''
      const args = (params.arguments ?? {}) as Record<string, unknown>
      if (!name) {
        return errorResponse(id, -32602, 'Missing tool name in params.name')
      }
      try {
        const result = await executeTool(user, name, args)
        return jsonResponse(id, {
          content: [{ type: 'text', text: result.content }],
          isError: result.isError ?? false,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return jsonResponse(id, {
          content: [{ type: 'text', text: `فشل تنفيذ الأداة: ${msg}` }],
          isError: true,
        })
      }
    }

    case 'resources/list':
      return jsonResponse(id, { resources: [] })

    case 'prompts/list':
      return jsonResponse(id, { prompts: [] })

    default: {
      if (isNotification) {
        return new NextResponse(null, { status: 202 })
      }
      return errorResponse(id, -32601, `Method not found: ${req.method}`)
    }
  }
}

export { statusArabic }
