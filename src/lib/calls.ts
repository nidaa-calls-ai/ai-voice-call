import { db } from '@/lib/db'
import { getInternalSecret } from '@/lib/settings'
import { sendPushToUser } from '@/lib/push'

export type CallInput = {
  userId: string
  source: 'mcp' | 'rest' | 'test'
  taskName: string
  summary?: string | null
  result?: string | null
  message?: string | null
  urgency?: string | null
}

const SOCKET_PORT = 3003
const RING_TIMEOUT_SEC = 45

/** Base URL of the socket.io mini-service (same machine). */
function socketBaseUrl(): string {
  return `http://127.0.0.1:${SOCKET_PORT}`
}

/** Server-to-server call to the socket mini-service. Never throws. */
async function socketInternal(path: string, body?: unknown): Promise<unknown | null> {
  try {
    const res = await fetch(`${socketBaseUrl()}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': getInternalSecret() },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export type SocketStatus = { phoneOnline: number; dashOnline: number }

/** Live connection counts for one user's rooms (phone:<id> / dash:<id>). */
export async function getSocketStatus(userId: string): Promise<SocketStatus> {
  const res = await socketInternal(`/internal/status?room=${encodeURIComponent(userId)}`)
  if (res && typeof res === 'object' && 'phoneOnline' in res) {
    return res as SocketStatus
  }
  return { phoneOnline: 0, dashOnline: 0 }
}

/** Room names are per-user so different accounts never see each other's realtime events. */
function phoneRoom(userId: string): string {
  return `phone:${userId}`
}
function dashRoom(userId: string): string {
  return `dash:${userId}`
}

async function emitToRoom(room: string, event: string, data: unknown): Promise<void> {
  await socketInternal('/internal/emit', { room, event, data })
}

export type CallRecord = {
  id: string
  source: string
  taskName: string
  summary: string | null
  result: string | null
  message: string | null
  urgency: string
  status: string
  createdAt: string
  answeredAt: string | null
  endedAt: string | null
  durationSec: number | null
  transcript: string | null
}

function serializeCall(call: {
  id: string
  source: string
  taskName: string
  summary: string | null
  result: string | null
  message: string | null
  urgency: string
  status: string
  createdAt: Date
  answeredAt: Date | null
  endedAt: Date | null
  durationSec: number | null
  transcript: string | null
}): CallRecord {
  return {
    id: call.id,
    source: call.source,
    taskName: call.taskName,
    summary: call.summary,
    result: call.result,
    message: call.message,
    urgency: call.urgency,
    status: call.status,
    createdAt: call.createdAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSec: call.durationSec,
    transcript: call.transcript,
  }
}

/**
 * Create a ringing call for ONE user, then:
 *  - if one of their phone clients is connected -> push a live "incoming-call" event over socket.io
 *  - otherwise                                  -> send a Web Push notification that opens the ringing screen
 *  - always                                     -> broadcast to their dashboard live feed
 */
export async function createCall(input: CallInput): Promise<CallRecord> {
  const call = await db.call.create({
    data: {
      userId: input.userId,
      source: input.source,
      taskName: input.taskName,
      summary: input.summary ?? null,
      result: input.result ?? null,
      message: input.message ?? null,
      urgency: input.urgency && ['low', 'normal', 'high'].includes(input.urgency) ? input.urgency : 'normal',
      status: 'ringing',
    },
  })

  const payload = serializeCall(call)
  const status = await getSocketStatus(input.userId)
  const pRoom = phoneRoom(input.userId)
  const dRoom = dashRoom(input.userId)

  // Live ring when one of the user's phone apps is connected
  if (status.phoneOnline > 0) {
    await emitToRoom(pRoom, 'incoming-call', payload)
  } else {
    // App closed -> Web Push notification opens the ringing screen (user's devices only)
    const body = payload.summary || payload.result || payload.message || 'المهمة خلصت وتحتاج مراجعة'
    void sendPushToUser(input.userId, {
      callId: payload.id,
      title: `مكالمة من المساعد: ${payload.taskName}`,
      body,
      url: `/phone?call=${payload.id}`,
      urgency: payload.urgency,
    })
  }

  // Dashboard live feed + start the missed-call countdown
  await emitToRoom(dRoom, 'incoming-call', payload)
  await socketInternal('/internal/watch-call', {
    callId: payload.id,
    timeoutSec: RING_TIMEOUT_SEC,
    userId: input.userId,
  })

  return payload
}

export type CallEventType = 'answered' | 'declined' | 'missed' | 'ended'

/**
 * Safety net (serverless-friendly): mark the user's calls stuck in "ringing" for more
 * than the ring timeout as missed. Covers lost in-memory timers (e.g. the socket
 * mini-service not running — like on Vercel) and service restarts.
 */
export async function reapStaleRingingCalls(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - (RING_TIMEOUT_SEC + 5) * 1000)
  try {
    await db.call.updateMany({
      where: { userId, status: 'ringing', createdAt: { lt: cutoff } },
      data: { status: 'missed', endedAt: new Date() },
    })
  } catch {
    /* ignore */
  }
}

/** Update a call status from socket/phone events and broadcast to the owner's dashboard. */
export async function updateCallFromEvent(callId: string, type: CallEventType, durationSec?: number): Promise<CallRecord | null> {
  const call = await db.call.findUnique({ where: { id: callId } })
  if (!call) return null
  if (['answered', 'declined', 'missed', 'completed'].includes(call.status) && type !== 'ended') {
    return serializeCall(call)
  }

  const now = new Date()
  const data: Record<string, unknown> = {}
  if (type === 'answered') {
    data.status = 'answered'
    data.answeredAt = now
  } else if (type === 'declined') {
    data.status = 'declined'
    data.endedAt = now
    if (call.answeredAt) data.durationSec = Math.round((now.getTime() - call.answeredAt.getTime()) / 1000)
  } else if (type === 'missed') {
    data.status = 'missed'
    data.endedAt = now
  } else if (type === 'ended') {
    data.status = call.answeredAt ? 'completed' : 'missed'
    data.endedAt = now
    if (typeof durationSec === 'number' && durationSec >= 0) {
      data.durationSec = durationSec
    } else if (call.answeredAt) {
      data.durationSec = Math.round((now.getTime() - call.answeredAt.getTime()) / 1000)
    }
  }

  const updated = await db.call.update({ where: { id: callId }, data })
  const payload = serializeCall(updated)
  if (updated.userId) {
    await emitToRoom(dashRoom(updated.userId), 'call-updated', payload)
  }
  return payload
}

export async function appendTranscript(callId: string, role: 'user' | 'assistant' | 'agent', text: string): Promise<number> {
  const call = await db.call.findUnique({ where: { id: callId }, select: { transcript: true } })
  let turns: Array<{ role: string; text: string; at: string }> = []
  if (call?.transcript) {
    try {
      const parsed = JSON.parse(call.transcript)
      if (Array.isArray(parsed)) turns = parsed
    } catch {
      /* corrupted transcript, start fresh */
    }
  }
  turns.push({ role, text, at: new Date().toISOString() })
  await db.call.update({ where: { id: callId }, data: { transcript: JSON.stringify(turns) } })
  return turns.length - 1
}

export type IndexedTurn = { index: number; role: string; text: string; at: string }

/** Parse the stored transcript JSON into stable, index-addressed turns (role: user | assistant | agent). */
export function parseTranscript(raw: string | null): IndexedTurn[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<{ role?: string; text?: string; at?: string }>
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((t) => t && typeof t.text === 'string' && t.text.trim())
      .map((t, i) => ({ index: i, role: String(t.role || 'assistant'), text: String(t.text), at: String(t.at || '') }))
  } catch {
    return []
  }
}

/**
 * Live-call bridge (agent <-> call): push a message from the external agent (GPT/Claude)
 * INTO an ongoing call. Stored as an 'agent' turn and broadcast to the owner's phone app,
 * where the assistant announces it out loud mid-call. The call itself is never ended
 * by the agent — only the user can hang up.
 */
export async function pushAgentUpdate(callId: string, text: string): Promise<{ index: number; status: string }> {
  const index = await appendTranscript(callId, 'agent', text)
  const call = await db.call.findUnique({ where: { id: callId }, select: { status: true, userId: true } })
  const payload = { callId, message: text, index }
  if (call?.userId) {
    await emitToRoom(phoneRoom(call.userId), 'agent-update', payload)
    await emitToRoom(dashRoom(call.userId), 'agent-update', payload)
  }
  return { index, status: call?.status || '' }
}

/** Get one call ONLY if it belongs to the given user (multi-user isolation). */
export async function getUserCall(callId: string, userId: string): Promise<CallRecord | null> {
  const call = await db.call.findFirst({ where: { id: callId, userId } })
  return call ? serializeCall(call) : null
}

export async function listUserCalls(userId: string, limit = 50): Promise<CallRecord[]> {
  const calls = await db.call.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  })
  return calls.map(serializeCall)
}

export async function getUserCallStats(userId: string) {
  const [total, answered, missed, ringing] = await Promise.all([
    db.call.count({ where: { userId } }),
    db.call.count({ where: { userId, status: { in: ['answered', 'completed'] } } }),
    db.call.count({ where: { userId, status: 'missed' } }),
    db.call.count({ where: { userId, status: 'ringing' } }),
  ])
  return { total, answered, missed, ringing }
}
