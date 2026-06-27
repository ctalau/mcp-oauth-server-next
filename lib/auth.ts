import type { NextApiRequest, NextApiResponse } from 'next';
import { store } from './store';
import { log } from './logger';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export type AuthedRequest = NextApiRequest & { authenticatedUser: string };

export function withAuth(
  handler: (req: AuthedRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const authHeader = req.headers.authorization;
    log('AUTH-MW', `${req.method} ${req.url}`, { has_auth: !!authHeader });

    if (!authHeader?.startsWith('Bearer ')) {
      log('AUTH-MW', 'No Bearer token → 401');
      res.setHeader(
        'WWW-Authenticate',
        `Bearer realm="mcp", resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
      );
      return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required' });
    }

    const rawToken = authHeader.slice(7);
    const td       = store.tokens.get(rawToken);

    if (!td) {
      log('AUTH-MW', `Token not found: ${rawToken.slice(0, 8)}…`);
      res.setHeader('WWW-Authenticate', 'Bearer realm="mcp", error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token' });
    }

    const ageMs = Date.now() - td.created_at;
    if (ageMs > td.expires_in * 1000) {
      store.tokens.delete(rawToken);
      log('AUTH-MW', 'Token expired');
      res.setHeader('WWW-Authenticate', 'Bearer realm="mcp", error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token', error_description: 'Token expired' });
    }

    log('AUTH-MW', `Valid for user="${td.user}" (age=${Math.round(ageMs / 1000)}s)`);
    (req as AuthedRequest).authenticatedUser = td.user;
    return handler(req as AuthedRequest, res);
  };
}
