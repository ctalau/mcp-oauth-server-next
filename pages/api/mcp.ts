// MCP Streamable HTTP transport endpoint.
// bodyParser is disabled so the MCP SDK can read the raw stream itself.
import type { NextApiRequest, NextApiResponse } from 'next';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import crypto from 'crypto';
import { store } from '../../lib/store';
import { log } from '../../lib/logger';
import { createMcpServer } from '../../lib/mcp-server';
import { withAuth, type AuthedRequest } from '../../lib/auth';

export const config = {
  api: {
    bodyParser: false, // Let the MCP SDK read the stream directly
    responseLimit: false,
  },
};

function isInitializeRequest(body: unknown): boolean {
  if (!body) return false;
  if (Array.isArray(body)) return (body as Array<{ method?: string }>).some(m => m.method === 'initialize');
  return (body as { method?: string }).method === 'initialize';
}

async function mcpHandler(req: AuthedRequest, res: NextApiResponse) {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  log('MCP', `${req.method} /api/mcp`, { user: req.authenticatedUser, session: sessionId || '(new)' });

  if (req.method === 'POST') {
    let transport = sessionId ? store.transports.get(sessionId) : undefined;

    if (!transport) {
      // Need to peek at the body to check if this is an initialize request.
      // Since bodyParser is off, read the raw body first.
      const rawBody = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });

      let parsedBody: unknown;
      try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = null; }

      log('MCP', `Parsed body method: ${(parsedBody as { method?: string })?.method}`);

      if (!isInitializeRequest(parsedBody)) {
        log('MCP', 'Non-initialize without session → 400');
        return res.status(400).json({
          jsonrpc: '2.0',
          error:   { code: -32600, message: 'No session — send initialize first' },
          id:      (parsedBody as { id?: unknown })?.id ?? null,
        });
      }

      log('MCP', `New session for user="${req.authenticatedUser}"`);

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid: string) => {
          log('MCP', `Session stored: ${sid}`);
          store.transports.set(sid, transport!);
        },
      });

      transport.onclose = () => {
        const sid = transport!.sessionId;
        if (sid) { store.transports.delete(sid); log('MCP', `Session removed: ${sid}`); }
      };

      const server = createMcpServer(req.authenticatedUser);
      await server.connect(transport);

      // Re-supply the already-read body so the transport doesn't try to read the consumed stream.
      await transport.handleRequest(req, res, parsedBody);

    } else {
      log('MCP', `Reusing session: ${sessionId}`);
      // Stream is untouched for subsequent requests; let the SDK read it.
      await transport.handleRequest(req, res);
    }

  } else if (req.method === 'GET') {
    const t = sessionId ? store.transports.get(sessionId) : undefined;
    if (!t) { log('MCP', `GET: session not found ${sessionId}`); return res.status(404).json({ error: 'Session not found' }); }
    await t.handleRequest(req, res);

  } else if (req.method === 'DELETE') {
    const t = sessionId ? store.transports.get(sessionId) : undefined;
    if (!t) { log('MCP', `DELETE: session not found ${sessionId}`); return res.status(404).json({ error: 'Session not found' }); }
    await t.handleRequest(req, res);
    if (sessionId) store.transports.delete(sessionId);

  } else {
    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default withAuth(mcpHandler);
