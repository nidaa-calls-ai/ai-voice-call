// Smoke test for the Nidaa AI-brain plumbing (local dev server on :3000 + mock LLM on :3101).
// Run the dev server with LLM_NO_LOCAL_FILE=1 so the /etc/.z-ai-config fallback is off,
// proving: 1) zero-config rule replies  2) per-account LLM settings save/load (masked)
// 3) the OpenAI-compatible streaming client talking to a user-configured endpoint.
const BASE = 'http://127.0.0.1:3000'
const USER = `nidaa_llm_smoke_${Math.floor(Math.random() * 1e6)}`
let failures = 0

function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` | ${extra}` : ''}`)
  if (!cond) failures++
}

async function chatStream(token, callId, text) {
  const res = await fetch(`${BASE}/api/call/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ callId, text, token }),
  })
  if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${await res.text()}`)
  const raw = await res.text()
  let reply = ''
  let audioCount = 0
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line)
      if (msg.type === 'done') reply = msg.reply || ''
      if (msg.type === 'audio') audioCount++
    } catch {}
  }
  return { reply, audioCount }
}

// 1. register
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER, password: 'smoke1234', displayName: 'LLM Smoke' }),
}).then((r) => r.json())
check('register', reg?.ok && !!reg?.user?.accessToken, USER)
const token = reg.user.accessToken

// 2. create a call
const call = await fetch(`${BASE}/api/notify?token=${token}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task_name: 'مهمة تجربة الدماغ',
    summary: 'دي ملخص المهمة التجريبية للس mocks',
    result: 'النتيجة 42 وحدة تجريبية',
  }),
}).then((r) => r.json())
check('create call', call?.ok && !!call?.call_id, call?.call_id)
const callId = call.call_id

// 3. zero-config: farewell -> rule reply (NOT the old network line)
let r1 = await chatStream(token, callId, 'شكراً خلاص كده')
check(
  'zero-config farewell rule reply',
  /أي وقت تحب تفاصيل/.test(r1.reply) && !/الشبكة وقفت/.test(r1.reply),
  r1.reply.slice(0, 60)
)

// 4. zero-config: details request -> answers from the call facts
let r2 = await chatStream(token, callId, 'قوللي التفاصيل')
check('zero-config details from facts', r2.reply.includes('مهمة تجربة الدماغ') || r2.reply.includes('42'), r2.reply.slice(0, 60))

// 5. save per-account LLM config (mock provider) and verify GET masking
const save = await fetch(`${BASE}/api/settings/llm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ api_key: 'sk-smoke-key-abcdef123456', base_url: 'http://127.0.0.1:3101/v1', model: 'mock-model', token }),
}).then((r) => r.json())
check('save llm settings', save?.ok && save?.configured === true, save?.apiKeyMasked)

const get = await fetch(`${BASE}/api/settings/llm?token=${token}`).then((r) => r.json())
check(
  'llm settings masked GET',
  get?.configured === true && get?.apiKeyMasked?.includes('••••') && !get?.apiKeyMasked?.includes('abcdef123456'),
  get?.apiKeyMasked
)

// 6. brain now streams from the user-configured OpenAI-compatible endpoint
let r3 = await chatStream(token, callId, 'رد حر أي حاجة')
check('user-configured brain reply', r3.reply.includes('دماغ النداء شغالة صح'), r3.reply.slice(0, 60))
check('streamed audio synthesized', r3.audioCount > 0, `audio chunks: ${r3.audioCount}`)

// 7. reset wipes the config
const reset = await fetch(`${BASE}/api/settings/llm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reset: true, token }),
}).then((r) => r.json())
check('reset llm settings', reset?.ok && reset?.configured === false)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
