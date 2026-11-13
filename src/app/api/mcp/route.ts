import { NextRequest, NextResponse } from 'next/server'
import { handleMcpPost } from '@/lib/mcp'
import { authenticate } from '@/lib/auth'

export const dynamic = 'force-dynamic'
// wait_for_call_updates long-polls up to 25s inside a single JSON-RPC request
export const maxDuration = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID, X-Api-Key',
  'Access-Control-Expose-Headers': 'MCP-Session-Id, MCP-Protocol-Version',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  try {
    // The personal access token IS the account: every MCP call is scoped to its owner
    let raw = ''
    const auth = req.headers.get('authorization')
    if (auth) {
      const m = auth.match(/^Bearer\s+(.+)$/i)
      if (m) raw = m[1].trim()
    }
    if (!raw) {
      const xApi = req.headers.get('x-api-key')
      if (xApi) raw = xApi.trim()
    }
    if (!raw) raw = (req.nextUrl.searchParams.get('token') || '').trim()

    const user = await authenticate({ headers: req.headers, query: req.nextUrl.searchParams })
    if (!user) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32001,
            message: 'Unauthorized: invalid or missing token. Use your personal access token (?token=<token> or Authorization: Bearer <token>) — get it from your account dashboard.',
          },
        },
        { status: 401, headers: CORS_HEADERS }
      )
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON body' } },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const res = await handleMcpPost(body, user)
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
    return res
  } catch (err) {
    console.error('[MCP] Unhandled error:', err)
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

/** Streamable HTTP: this stateless server does not offer server-initiated SSE streams. */
export async function GET() {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Method Not Allowed: this server accepts JSON-RPC over POST only (stateless streamable HTTP).' },
    },
    { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS' } }
  )
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS' } })
}
