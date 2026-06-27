// DCR — client_id IS the registration data, HMAC-signed.
// No server-side storage; the signed client_id is self-verifying.
import type { NextApiRequest, NextApiResponse } from 'next';
import { createToken } from '../../../lib/tokens';
import { log } from '../../../lib/logger';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  log('DCR', 'Registration request', req.body);

  const { client_name, redirect_uris, grant_types, response_types, scope, token_endpoint_auth_method } = req.body;

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' });
  }

  // Encode everything into the client_id — no DB row needed.
  const client_id = createToken({
    type:                      'client',
    client_name:               client_name || 'Unknown Client',
    redirect_uris,
    grant_types:               grant_types    || ['authorization_code'],
    response_types:            response_types || ['code'],
    scope:                     scope          || 'mcp',
    token_endpoint_auth_method: token_endpoint_auth_method || 'none',
  }); // no TTL — clients don't expire

  log('DCR', 'Client registered (stateless)', { client_name, redirect_uris });

  res.status(201).json({
    client_id,
    client_name:               client_name || 'Unknown Client',
    redirect_uris,
    grant_types:               grant_types    || ['authorization_code'],
    response_types:            response_types || ['code'],
    scope:                     scope          || 'mcp',
    token_endpoint_auth_method: token_endpoint_auth_method || 'none',
  });
}
