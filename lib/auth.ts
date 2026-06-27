import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken } from './tokens';
import { log } from './logger';

// Prefer explicit env var; fall back to Vercel-injected URLs (stable prod URL first),
// then localhost for local dev.
const _envBase = process.env.BASE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || 'http://localhost:3000';
export const BASE_URL = _envBase;

export interface TokenPayload { type: 'token'; user: string; scope: string; }
export type AuthedRequest = NextApiRequest & { authenticatedUser: string };

export function withAuth(
  handler: (req: AuthedRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const authHeader = req.headers.authorization;
    log('AUTH-MW', `${req.method} ${req.url}`, { has_auth: !!authHeader });

    if (!authHeader?.startsWith('Bearer ')) {
      log('AUTH-MW', 'No Bearer token → 401');
      res.setHeader('WWW-Authenticate',
        `Bearer realm="mcp", resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
      );
      return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required' });
    }

    const rawToken = authHeader.slice(7);
    const payload  = verifyToken<TokenPayload>(rawToken);

    if (!payload || payload.type !== 'token') {
      log('AUTH-MW', 'Token invalid or expired');
      res.setHeader('WWW-Authenticate', 'Bearer realm="mcp", error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token' });
    }

    log('AUTH-MW', `Valid for user="${payload.user}"`);
    (req as AuthedRequest).authenticatedUser = payload.user;
    return handler(req as AuthedRequest, res);
  };
}
