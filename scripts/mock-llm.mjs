// Tiny OpenAI-compatible mock LLM for smoke-testing the Nidaa brain plumbing.
// Listens on 127.0.0.1:3101, base_url to use: http://127.0.0.1:3101/v1
import http from 'http'

const REPLY = 'تمام يا فندم، ده رد الموديل التجريبي — لو بتسمع الكلام ده يبقى دماغ النداء شغالة صح.'

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let model = 'unknown'
      try {
        model = JSON.parse(body)?.model || 'none-sent'
      } catch {}
      console.log('[mock-llm] request received, model =', model)
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const words = REPLY.split(' ')
      let i = 0
      const tick = setInterval(() => {
        if (i < words.length) {
          const piece = (i === 0 ? '' : ' ') + words[i]
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
          i++
        } else {
          res.write('data: [DONE]\n\n')
          res.end()
          clearInterval(tick)
        }
      }, 30)
    })
    return
  }
  res.writeHead(404).end()
})

server.listen(3101, '127.0.0.1', () => console.log('[mock-llm] listening on 127.0.0.1:3101'))
