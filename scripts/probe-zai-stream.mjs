// Diagnostic: probe the z-ai SDK chat streaming shapes directly.
import ZAI from 'z-ai-web-dev-sdk'

const zai = await ZAI.create()

console.log('--- test 1: stream=true, thinking disabled')
try {
  const c = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: 'إنت مساعد بسيط. جاوب بجملة واحدة.' },
      { role: 'user', content: 'التقرير جاهز؟' },
    ],
    stream: true,
    thinking: { type: 'disabled' },
  })
  console.log('type:', typeof c, 'isAsyncIter:', typeof c?.[Symbol.asyncIterator] === 'function')
  if (typeof c?.[Symbol.asyncIterator] === 'function') {
    let n = 0
    let full = ''
    for await (const part of c) {
      n++
      if (n <= 3) console.log('chunk', n, JSON.stringify(part).slice(0, 220))
      full += part?.choices?.[0]?.delta?.content || ''
    }
    console.log('chunks:', n, 'full length:', full.length, 'full:', full.slice(0, 120))
  }
} catch (e) {
  console.log('ERR1:', e?.message || e)
}

console.log('--- test 2: stream=true again immediately (repeat probe)')
try {
  const c = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: 'إنت مساعد بسيط. جاوب بجملة واحدة.' },
      { role: 'user', content: 'التقرير جاهز؟' },
    ],
    stream: true,
    thinking: { type: 'disabled' },
  })
  let n = 0
  let full = ''
  if (typeof c?.[Symbol.asyncIterator] === 'function') {
    for await (const part of c) {
      n++
      full += part?.choices?.[0]?.delta?.content || ''
    }
  }
  console.log('chunks:', n, 'full length:', full.length, 'full:', full.slice(0, 120))
} catch (e) {
  console.log('ERR2:', e?.message || e)
}

console.log('--- test 3: NON-stream, thinking disabled')
try {
  const c = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: 'إنت مساعد بسيط. جاوب بجملة واحدة.' },
      { role: 'user', content: 'التقرير جاهز؟' },
    ],
    thinking: { type: 'disabled' },
  })
  const text = c?.choices?.[0]?.message?.content
  console.log('non-stream text length:', text?.length, 'text:', String(text).slice(0, 120))
} catch (e) {
  console.log('ERR3:', e?.message || e)
}
