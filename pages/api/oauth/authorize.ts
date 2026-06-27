// Processes the login form POST. Decodes the signed client_id to validate
// redirect_uri, then issues a short-lived signed authorization code.
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken, createToken } from '../../../lib/tokens';
import { log } from '../../../lib/logger';

interface ClientPayload {
  type: 'client';
  redirect_uris: string[];
  scope: string;
}

const VALID_USERS: Record<string, string> = { user: 'user' };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = req.body;
  log('AUTH', 'Login form submitted', { username, client_id: client_id?.slice(0, 20) + '…', has_pkce: !!code_challenge });

  // Decode client_id to extract registered redirect_uris
  const clientData = verifyToken<ClientPayload>(client_id);
  if (!clientData || clientData.type !== 'client') {
    log('AUTH', 'Invalid client_id');
    return res.status(400).json({ error: 'invalid_client' });
  }

  if (!clientData.redirect_uris.includes(redirect_uri)) {
    log('AUTH', 'redirect_uri not in registered list', { redirect_uri, allowed: clientData.redirect_uris });
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
  }

  if (!VALID_USERS[username] || VALID_USERS[username] !== password) {
    log('AUTH', `Login failed for username="${username}"`);
    const qs = new URLSearchParams({
      client_id, redirect_uri, scope: scope || '', state: state || '',
      code_challenge: code_challenge || '', code_challenge_method: code_challenge_method || '',
      error: 'Invalid username or password',
    });
    return res.redirect(302, `/oauth/authorize?${qs}`);
  }

  // Encode all auth-code data into the signed code itself — no storage.
  const code = createToken({
    type:                  'code',
    client_id,
    redirect_uri,
    scope:                 scope || 'mcp',
    state:                 state || null,
    code_challenge:        code_challenge        || null,
    code_challenge_method: code_challenge_method || null,
    user:                  username,
  }, 10 * 60 * 1000); // 10-minute TTL

  log('AUTH', `Signed auth code created for user="${username}"`, { pkce: code_challenge_method || 'none' });

  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set('code', code);
  if (state) callbackUrl.searchParams.set('state', state);

  res.redirect(302, callbackUrl.toString());
}
