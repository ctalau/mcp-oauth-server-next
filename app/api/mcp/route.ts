// The MCP Streamable HTTP endpoint — the protected resource.
//
// Implements just enough of the JSON-RPC protocol (initialize, ping,
// tools/list, tools/call, notifications) to work with Claude Code, without the
// MCP SDK's session manager. Every request is self-contained and authenticated
// by a Bearer access token; there is no session state to keep.
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verify } from '@/lib/tokens';
import { originFromRequest } from '@/lib/url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'mcp-oauth-server-next', version: '1.0.0' };

const TOOLS = [
  {
    name: 'get_current_day',
    description: "Returns today's date and day of the week (UTC).",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

interface AccessToken {
  user: string;
  scope: string;
}

// ---- JSON-RPC helpers -------------------------------------------------------

type JsonRpcId = string | number | null;

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: '2.0' as const, id, result: value };
}
function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } };
}

// Returns the JSON-RPC response object, or null for notifications (no reply).
function dispatch(msg: any, user: string): object | null {
  const id: JsonRpcId = msg?.id ?? null;
  const method: string = msg?.method;

  // Notifications (e.g. notifications/initialized) have no id and expect no body.
  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return null;
  }

  switch (method) {
    case 'initialize':
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'ping':
      return result(id, {});

    case 'tools/list':
      return result(id, { tools: TOOLS });

    case 'tools/call': {
      const name = msg?.params?.name;
      if (name === 'get_current_day') {
        const today = new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        });
        return result(id, {
          content: [{ type: 'text', text: `Today is ${today} (UTC). Authenticated as "${user}".` }],
          isError: false,
        });
      }
      return result(id, {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      });
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ---- Auth -------------------------------------------------------------------

function authenticate(req: Request): AccessToken | null {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  return verify<AccessToken>(header.slice(7), 'access');
}

function unauthorized(req: Request) {
  const origin = originFromRequest(req);
  return new NextResponse(
    JSON.stringify({ error: 'unauthorized', error_description: 'A valid Bearer token is required.' }),
    {
      status: 401,
      headers: {
        'content-type': 'application/json',
        // This header is what kicks off the whole OAuth discovery flow.
        'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

// ---- HTTP handlers ----------------------------------------------------------

export async function POST(req: Request) {
  const auth = authenticate(req);
  if (!auth) return unauthorized(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  // Support JSON-RPC batches as well as single messages.
  const payload = Array.isArray(body)
    ? body.map((m) => dispatch(m, auth.user)).filter((r): r is object => r !== null)
    : dispatch(body, auth.user);

  // Nothing to return (notification-only) → 202 Accepted.
  if (payload === null || (Array.isArray(payload) && payload.length === 0)) {
    return new NextResponse(null, { status: 202 });
  }

  // The Streamable HTTP transport lets the server reply with either JSON or a
  // one-shot SSE event. Honor whichever the client accepts.
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/event-stream')) {
    return new NextResponse(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'mcp-session-id': randomUUID(),
      },
    });
  }

  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json', 'mcp-session-id': randomUUID() },
  });
}

// Stateless server: there is no SSE subscription to open and no session to end.
export async function GET() {
  return NextResponse.json(
    { error: 'method_not_allowed', error_description: 'Stateless server: POST JSON-RPC messages.' },
    { status: 405 },
  );
}

export async function DELETE() {
  return new NextResponse(null, { status: 204 });
}
