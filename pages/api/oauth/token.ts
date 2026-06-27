import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { store } from '../../../lib/store';
import { log } from '../../../lib/logger';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { grant_type, code, redirect_uri, code_verifier } = req.body;
  let { client_id } = req.body as { client_id: string };

  // HTTP Basic auth for confidential clients
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const sep     = decoded.indexOf(':');
    if (sep > -1) { client_id = decoded.slice(0, sep); }
    log('TOKEN', `Basic auth: client_id=${client_id}`);
  }

  log('TOKEN', 'Token request', { grant_type, client_id, has_verifier: !!code_verifier, code: code?.slice(0, 8) + '…' });

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const codeData = store.authCodes.get(code);
  if (!codeData) {
    log('TOKEN', 'Code not found or consumed');
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid authorization code' });
  }

  const codeAgeMs = Date.now() - codeData.created_at;
  if (codeAgeMs > 10 * 60 * 1000) {
    store.authCodes.delete(code);
    log('TOKEN', `Code expired (age=${Math.round(codeAgeMs / 1000)}s)`);
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code expired' });
  }

  if (codeData.client_id !== client_id) {
    log('TOKEN', `client_id mismatch: expected=${codeData.client_id}, got=${client_id}`);
    return res.status(400).json({ error: 'invalid_client' });
  }

  if (codeData.redirect_uri !== redirect_uri) {
    log('TOKEN', 'redirect_uri mismatch');
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
  }

  // ── PKCE verification (S256) ───────────────────────────────
  if (codeData.code_challenge) {
    log('TOKEN', 'Verifying PKCE', { method: codeData.code_challenge_method, has_verifier: !!code_verifier });
    if (!code_verifier) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'code_verifier required' });
    }

    const computed = codeData.code_challenge_method === 'S256'
      ? crypto.createHash('sha256').update(code_verifier).digest('base64url')
      : code_verifier;

    const match = computed === codeData.code_challenge;
    log('TOKEN', `PKCE result: match=${match}`);
    if (!match) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE code_verifier mismatch' });
    }
    log('TOKEN', 'PKCE OK ✓');
  }

  store.authCodes.delete(code); // one-time use

  const access_token = crypto.randomBytes(32).toString('hex');
  store.tokens.set(access_token, {
    client_id,
    user:       codeData.user,
    scope:      codeData.scope,
    created_at: Date.now(),
    expires_in: 3600,
  });

  log('TOKEN', `Token issued for user="${codeData.user}"`, { token: access_token.slice(0, 8) + '…' });

  res.json({ access_token, token_type: 'Bearer', expires_in: 3600, scope: codeData.scope });
}
