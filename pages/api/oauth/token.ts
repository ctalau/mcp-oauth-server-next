// Token endpoint — decodes the signed auth code, verifies PKCE, issues a signed access token.
// No DB lookups; the signatures on both tokens prove authenticity.
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { verifyToken, createToken } from '../../../lib/tokens';
import { log } from '../../../lib/logger';

interface CodePayload {
  type: 'code';
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string | null;
  code_challenge: string | null;
  code_challenge_method: string | null;
  user: string;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { grant_type, code, redirect_uri, code_verifier } = req.body;
  let { client_id } = req.body as { client_id: string };

  // HTTP Basic auth support
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep > -1) client_id = decoded.slice(0, sep);
  }

  log('TOKEN', 'Token request', { grant_type, has_verifier: !!code_verifier });

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  // Decode and verify the signed auth code (also checks the 10-min TTL)
  const codeData = verifyToken<CodePayload>(code);
  if (!codeData || codeData.type !== 'code') {
    log('TOKEN', 'Invalid or expired auth code');
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
  }

  if (codeData.client_id !== client_id) {
    log('TOKEN', 'client_id mismatch');
    return res.status(400).json({ error: 'invalid_client' });
  }

  if (codeData.redirect_uri !== redirect_uri) {
    log('TOKEN', 'redirect_uri mismatch');
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
  }

  // ── PKCE ────────────────────────────────────────────────────
  if (codeData.code_challenge) {
    if (!code_verifier) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier required' });
    }
    const computed = codeData.code_challenge_method === 'S256'
      ? crypto.createHash('sha256').update(code_verifier).digest('base64url')
      : code_verifier;

    log('TOKEN', `PKCE: match=${computed === codeData.code_challenge}`);
    if (computed !== codeData.code_challenge) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
    }
    log('TOKEN', 'PKCE OK ✓');
  }

  // Issue a signed access token — no storage needed
  const access_token = createToken(
    { type: 'token', user: codeData.user, scope: codeData.scope },
    3600 * 1000  // 1 hour TTL
  );

  log('TOKEN', `Access token issued for user="${codeData.user}"`);
  res.json({ access_token, token_type: 'Bearer', expires_in: 3600, scope: codeData.scope });
}
