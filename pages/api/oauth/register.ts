import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { store } from '../../../lib/store';
import { log } from '../../../lib/logger';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  log('DCR', 'Registration request', req.body);

  const { client_name, redirect_uris, grant_types, response_types, scope, token_endpoint_auth_method } = req.body;

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' });
  }

  const client_id     = crypto.randomUUID();
  const isPublic      = token_endpoint_auth_method === 'none';
  const client_secret = isPublic ? undefined : crypto.randomBytes(32).toString('hex');

  const client = {
    client_id,
    client_secret,
    client_name:               client_name || 'Unknown Client',
    redirect_uris,
    grant_types:               grant_types    || ['authorization_code'],
    response_types:            response_types || ['code'],
    scope:                     scope          || 'mcp',
    token_endpoint_auth_method: token_endpoint_auth_method || 'none',
    registered_at:             new Date().toISOString(),
  };

  store.clients.set(client_id, client);
  log('DCR', `Client registered`, { client_id, client_name: client.client_name, public: isPublic, total: store.clients.size });

  const response: Record<string, unknown> = {
    client_id, client_name: client.client_name, redirect_uris: client.redirect_uris,
    grant_types: client.grant_types, response_types: client.response_types,
    scope: client.scope, token_endpoint_auth_method: client.token_endpoint_auth_method,
  };
  if (client_secret) response.client_secret = client_secret;

  res.status(201).json(response);
}
