// Stateless MCP endpoint — implements the Streamable HTTP transport protocol
// directly as JSON-RPC, without SDK session management.
// Every request is self-contained; mcp-session-id is issued but not tracked.
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { withAuth, type AuthedRequest } from '../../lib/auth';
import { log } from '../../lib/logger';

// Keep body parsing enabled — Next.js parses JSON, we pass it directly.
export const config = { api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: false } };

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const TOOLS = [{
  name:        'get_current_day',
  description: "Returns today's day of the week and full date.",
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
}];

function jsonrpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function jsonrpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function sendMcp(req: NextApiRequest, res: NextApiResponse, data: unknown) {
  const accept = req.headers.accept ?? '';
  if (accept.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  }
}

function handleMessage(body: Record<string, unknown>, user: string): { response: unknown; setSessionId?: string } | null {
  const id     = body.id ?? null;
  const method = body.method as string;
  const params = (body.params ?? {}) as Record<string, unknown>;

  log('MCP', `method="${method}" user="${user}"`, { id });

  // Notifications have no id and expect no response
  if (method?.startsWith('notifications/')) {
    log('MCP', `Notification "${method}" — no response`);
    return null;
  }

  switch (method) {
    case 'initialize':
      return {
        response:     jsonrpc(id, {
          protocolVersion: '2025-03-26',
          capabilities:    { tools: {} },
          serverInfo:      { name: 'mcp-oauth-next', version: '1.0.0' },
        }),
        setSessionId: crypto.randomUUID(), // issued for protocol compat, not tracked
      };

    case 'ping':
      return { response: jsonrpc(id, {}) };

    case 'tools/list':
      return { response: jsonrpc(id, { tools: TOOLS }) };

    case 'tools/call': {
      const toolName = params.name as string;
      log('MCP', `tools/call name="${toolName}"`);
      if (toolName === 'get_current_day') {
        const now  = new Date();
        const text = `Today is ${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
        log('MCP', `→ "${text}"`);
        return { response: jsonrpc(id, { content: [{ type: 'text', text }], isError: false }) };
      }
      return { response: jsonrpc(id, { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true }) };
    }

    default:
      return { response: jsonrpcError(id, -32601, `Method not found: ${method}`) };
  }
}

async function mcpHandler(req: AuthedRequest, res: NextApiResponse): Promise<void> {
  log('MCP', `${req.method} /api/mcp`, { user: req.authenticatedUser, session: req.headers['mcp-session-id'] ?? '(none)' });

  if (req.method === 'DELETE') {
    // Session teardown — nothing to clean up in stateless mode
    return res.status(200).json({});
  }

  if (req.method === 'GET') {
    // SSE subscription — not needed for simple request/response tools
    return res.status(405).json({ error: 'SSE stream not supported in stateless mode' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // Handle JSON-RPC batch
  if (Array.isArray(body)) {
    const responses = body
      .map(msg => handleMessage(msg as Record<string, unknown>, req.authenticatedUser))
      .filter(Boolean)
      .map(r => r!.response);
    return sendMcp(req, res, responses);
  }

  const result = handleMessage(body as Record<string, unknown>, req.authenticatedUser);

  if (!result) {
    // Notification — no body response
    res.status(202).end(); return;
  }

  if (result.setSessionId) {
    res.setHeader('mcp-session-id', result.setSessionId);
  }

  sendMcp(req, res, result.response);
}

export default withAuth(mcpHandler);
