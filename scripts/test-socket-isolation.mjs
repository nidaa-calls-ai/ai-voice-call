/**
 * Socket room isolation test: two accounts connect to the call-service,
 * each joins with its own token, then a call is created for account A only.
 * Expected: A's phone socket receives incoming-call, B's phone socket does NOT.
 */
import { io } from 'socket.io-client'

const [tokenA, tokenB] = process.argv.slice(2)
const URL = 'http://127.0.0.1:3003'

function connect(token, label) {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ['websocket', 'polling'], forceNew: true, timeout: 8000 })
    const events = []
    s.on('connect', () => s.emit('join:phone', { token }))
    s.on('joined', () => {
      console.log(`[${label}] joined phone room OK`)
      resolve({ s, events })
    })
    s.on('join-error', (e) => {
      console.log(`[${label}] JOIN-ERROR:`, e)
      resolve({ s, events })
    })
    s.on('incoming-call', (c) => events.push(`incoming-call:${c.taskName}`))
    s.on('agent-update', (d) => events.push(`agent-update:${d.message}`))
    setTimeout(() => resolve({ s, events }), 8000)
  })
}

const a = await connect(tokenA, 'A/owner')
const b = await connect(tokenB, 'B/user2')

// trigger a call for account A through the REST API
const res = await fetch('http://127.0.0.1:3000/api/notify', {
  method: 'POST',
  headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ task_name: 'اختبار غرفة A الخاصة', summary: 'المفروض يوصله لـ A بس' }),
})
console.log('call created for A:', (await res.json()).call_id)

await new Promise((r) => setTimeout(r, 2500))
console.log('A events:', a.events)
console.log('B events:', b.events)
console.log(b.events.length === 0 && a.events.some((e) => e.startsWith('incoming-call')) ? 'ISOLATION OK ✅' : 'ISOLATION FAILED ❌')
a.s.disconnect()
b.s.disconnect()
process.exit(0)
