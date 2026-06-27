// Handles the form POST from /oauth/authorize (the React login page).
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { store } from '../../../lib/store';
import { log } from '../../../lib/logger';

const VALID_USERS: Record<string, string> = { user: 'user' };

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = req.body;
  log('AUTH', 'Login form submitted', { username, client_id, has_pkce: !!code_challenge });

  const client = store.clients.get(client_id);
  if (!client) return res.status(400).json({ error: 'Unknown client' });

  if (!VALID_USERS[username] || VALID_USERS[username] !== password) {
    log('AUTH', `Login failed for username="${username}"`);
    const qs = new URLSearchParams({
      client_id, redirect_uri, scope: scope || '', state: state || '',
      code_challenge: code_challenge || '', code_challenge_method: code_challenge_method || '',
      error: 'Invalid username or password',
    });
    return res.redirect(302, `/oauth/authorize?${qs}`);
  }

  const code = crypto.randomBytes(32).toString('hex');
  store.authCodes.set(code, {
    client_id,
    redirect_uri,
    scope: scope || 'mcp',
    state: state || undefined,
    code_challenge:        code_challenge        || null,
    code_challenge_method: code_challenge_method || null,
    user:       username,
    created_at: Date.now(),
  });

  log('AUTH', `Auth code created: ${code.slice(0, 8)}…`, { user: username, pkce: code_challenge_method || 'none' });

  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set('code', code);
  if (state) callbackUrl.searchParams.set('state', state);

  log('AUTH', `Redirecting to: ${callbackUrl.toString().slice(0, 80)}…`);
  res.redirect(302, callbackUrl.toString());
}
