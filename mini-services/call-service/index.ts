import { createServer } from 'http'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Server, Socket } from 'socket.io'

// Load the root .env (the service runs from its own directory)
function loadRootEnv() {
  try {
    const envPath = join(import.meta.dir, '..', '..', '.env')
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    /* .env not found, use defaults */
  }
}
loadRootEnv()

/**
 * call-service — realtime ringing channel (socket.io mini service, port 3003).
 * MULTI-USER: rooms are scoped per account, so users never see each other's calls.
 *
 * Rooms:
 *   phone:<userId>  -> the PWA on THAT user's mobile (receives "incoming-call" and rings)
 *   dash:<userId>   -> THAT user's dashboard live feed (call lifecycle + phone online state)
 *
 * Internal HTTP endpoints (same server, localhost only, shared-secret protected):
 *   POST /internal/emit        { room, event, data }          -> emit event to a room
 *   POST /internal/watch-call  { callId, timeoutSec, userId } -> start missed-call countdown
 *   GET  /internal/status?room=<userId>                       -> { phoneOnline, dashOnline } for that user
 *
 * Phone client events:
 *   join:phone  { token }     -> token verified against Next.js -> joins phone:<userId>
 *   join:dash   { token }     -> token verified against Next.js -> joins dash:<userId>
 *   call:answer { callId }    -> relayed to that user's dash room + recorded in Next.js DB
 *   call:decline{ callId }
 *   call:end    { callId, durationSec }
 */

const PORT = 3003
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'nidaa-internal-secret'
const NEXT_BASE = 'http://127.0.0.1:3000'

const httpServer = createServer((req, res) => {
  // ---- internal HTTP endpoints for the Next.js server ----
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    const secret = req.headers['x-internal-secret']
    if (secret !== INTERNAL_SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Forbidden' }))
      return
    }

    if (req.url?.startsWith('/internal/status') && req.method === 'GET') {
      // per-user status: ?room=<userId> -> counts of that user's phone/dash sockets
      const room = new URL(req.url, 'http://x').searchParams.get('room') || ''
      const phoneKey = room ? `phone:${room}` : 'phone'
      const dashKey = room ? `dash:${room}` : 'dash'
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          phoneOnline: roomCounts.get(phoneKey)?.size ?? 0,
          dashOnline: roomCounts.get(dashKey)?.size ?? 0,
        })
      )
      return
    }

    if (req.method === 'POST') {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = body ? JSON.parse(body) : {}
      } catch {
        parsed = {}
      }

      if (req.url === '/internal/emit') {
        const room = String(parsed.room || '')
        const event = String(parsed.event || '')
        if (room && event) {
          io.to(room).emit(event, parsed.data ?? null)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      if (req.url === '/internal/watch-call') {
        const callId = String(parsed.callId || '')
        const timeoutSec = Number(parsed.timeoutSec || 45)
        const userId = String(parsed.userId || '')
        if (callId) startMissedTimer(callId, timeoutSec, userId)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
        return
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  })
})

const io = new Server(httpServer, {
  // Standard socket.io path — the client (io('/?XTransformPort=3003')) uses '/socket.io' by default,
  // and Caddy forwards it here via the XTransformPort query param.
  // Keeping the standard path lets /internal/* requests fall through to the HTTP handler below.
  path: '/socket.io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// room name -> set of socket ids in it (per-user isolation)
const roomCounts = new Map<string, Set<string>>()

function trackJoin(room: string, socketId: string) {
  if (!roomCounts.has(room)) roomCounts.set(room, new Set())
  roomCounts.get(room)!.add(socketId)
}
function trackLeave(socketId: string) {
  for (const [room, set] of roomCounts) {
    if (set.delete(socketId) && set.size === 0) roomCounts.delete(room)
  }
}
function countIn(room: string): number {
  return roomCounts.get(room)?.size ?? 0
}

// callId -> pending missed-call timer (with the owner's userId)
const ringTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; userId: string }>()

function startMissedTimer(callId: string, timeoutSec: number, userId: string) {
  cancelMissedTimer(callId)
  const t = setTimeout(() => {
    ringTimers.delete(callId)
    // Nobody answered / declined / ended in time -> mark as missed
    const pRoom = userId ? `phone:${userId}` : 'phone'
    const dRoom = userId ? `dash:${userId}` : 'dash'
    io.to(pRoom).emit('call-missed', { callId })
    io.to(dRoom).emit('call-missed', { callId })
    void notifyNext(callId, 'missed')
  }, Math.max(5, timeoutSec) * 1000)
  ringTimers.set(callId, { timer: t, userId })
}

function cancelMissedTimer(callId: string) {
  const entry = ringTimers.get(callId)
  if (entry) {
    clearTimeout(entry.timer)
    ringTimers.delete(callId)
  }
}

async function notifyNext(callId: string, type: 'answered' | 'declined' | 'ended' | 'missed', durationSec?: number) {
  try {
    await fetch(`${NEXT_BASE}/api/internal/call-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ callId, type, durationSec }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    console.error(`[call-service] notifyNext(${type}) failed:`, err)
  }
}

// token -> userId cache so we do not hit Next.js on every reconnect
const tokenCache = new Map<string, { userId: string; username: string; at: number }>()
async function verifyToken(token: string): Promise<{ userId: string; username: string } | null> {
  const clean = (token || '').trim()
  if (!clean) return null
  const cached = tokenCache.get(clean)
  if (cached && Date.now() - cached.at < 60_000) return { userId: cached.userId, username: cached.username }
  try {
    const res = await fetch(`${NEXT_BASE}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ token: clean }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; userId?: string; username?: string }
    if (data?.ok && data.userId) {
      tokenCache.set(clean, { userId: data.userId, username: data.username || '', at: Date.now() })
      // keep the cache small
      if (tokenCache.size > 500) {
        const oldest = [...tokenCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (oldest) tokenCache.delete(oldest[0])
      }
      return { userId: data.userId, username: data.username || '' }
    }
  } catch (err) {
    console.error('[call-service] verifyToken failed:', err)
  }
  return null
}

io.on('connection', (socket: Socket) => {
  // userId attached after a successful join (used to scope call events)
  let joinedUserId = ''

  socket.on('join:phone', async (data: { token?: string }) => {
    const verified = await verifyToken(data?.token || '')
    if (!verified) {
      socket.emit('join-error', { message: 'Invalid token' })
      return
    }
    joinedUserId = verified.userId
    const room = `phone:${verified.userId}`
    socket.join(room)
    trackJoin(room, socket.id)
    io.to(`dash:${verified.userId}`).emit('phone-online', { online: true, count: countIn(room) })
    socket.emit('joined', { room })
  })

  socket.on('join:dash', async (data?: { token?: string }) => {
    const verified = await verifyToken(data?.token || '')
    if (!verified) {
      socket.emit('join-error', { message: 'Invalid token' })
      return
    }
    joinedUserId = verified.userId
    const room = `dash:${verified.userId}`
    socket.join(room)
    trackJoin(room, socket.id)
    socket.emit('joined', { room, phoneOnline: countIn(`phone:${verified.userId}`) })
  })

  socket.on('call:answer', (data: { callId?: string }) => {
    const callId = String(data?.callId || '')
    if (!callId) return
    cancelMissedTimer(callId)
    if (joinedUserId) io.to(`dash:${joinedUserId}`).emit('call-answered', { callId })
    void notifyNext(callId, 'answered')
  })

  socket.on('call:decline', (data: { callId?: string }) => {
    const callId = String(data?.callId || '')
    if (!callId) return
    cancelMissedTimer(callId)
    if (joinedUserId) io.to(`dash:${joinedUserId}`).emit('call-declined', { callId })
    void notifyNext(callId, 'declined')
  })

  socket.on('call:end', (data: { callId?: string; durationSec?: number }) => {
    const callId = String(data?.callId || '')
    if (!callId) return
    cancelMissedTimer(callId)
    const durationSec = Number(data?.durationSec || 0)
    if (joinedUserId) io.to(`dash:${joinedUserId}`).emit('call-ended', { callId, durationSec })
    void notifyNext(callId, 'ended', durationSec)
  })

  socket.on('disconnect', () => {
    trackLeave(socket.id)
    if (joinedUserId) {
      io.to(`dash:${joinedUserId}`).emit('phone-online', { online: countIn(`phone:${joinedUserId}`) > 0, count: countIn(`phone:${joinedUserId}`) })
    }
  })

  socket.on('error', (error) => {
    console.error(`[call-service] socket error (${socket.id}):`, error)
  })
})

httpServer.listen(PORT, () => {
  console.log(`call-service (socket.io) running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
