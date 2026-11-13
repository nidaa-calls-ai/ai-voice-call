// Verify 'agent-update' socket broadcast reaches connected clients.
// Run: bun scripts/test-bridge-socket.ts
import { io } from 'socket.io-client'

const BASE = 'http://localhost:3000'

async function post(path: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

async function main() {
  const cfg = (await (await fetch(BASE + '/api/config')).json()) as { token: string }

  const socket = io('http://localhost:3003', { transports: ['websocket', 'polling'] })
  const gotAgent = new Promise<{ callId: string; message: string; index: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('agent-update NOT received in 15s')), 15000)
    socket.on('agent-update', (d: { callId: string; message: string; index: number }) => {
      clearTimeout(t)
      resolve(d)
    })
  })
  socket.on('connect', () => socket.emit('join:dash'))
  await new Promise<void>((r) => socket.on('joined', () => r()) || setTimeout(r, 3000))
  console.log('dash client joined, listening...')

  // create + answer a call, then push an agent update
  await post('/api/test-call', {})
  await new Promise((r) => setTimeout(r, 1500))
  const calls = (await (await fetch(BASE + '/api/calls')).json()) as { calls: Array<{ id: string; status: string }> }
  const call = calls.calls.find((c) => c.status === 'ringing')
  if (!call) throw new Error('no ringing call')
  await fetch(`${BASE}/api/calls/${call.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'answered' }),
  })
  await post(`/api/mcp?token=${cfg.token}`, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'send_call_update', arguments: { call_id: call.id, message: 'تجربة بث مباشر جوه المكالمة' } },
  })

  const evt = await gotAgent
  console.log('agent-update received:', JSON.stringify(evt))
  socket.disconnect()
  await fetch(`${BASE}/api/calls/${call.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'ended', durationSec: 12 }),
  })
  console.log('SOCKET BRIDGE OK')
  process.exit(0)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
