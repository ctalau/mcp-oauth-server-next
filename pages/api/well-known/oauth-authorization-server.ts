import type { NextApiRequest, NextApiResponse } from 'next';
import { log } from '../../../lib/logger';
import { BASE_URL } from '../../../lib/auth';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  log('DISCOVERY', 'Auth server metadata requested');
  const body = {
    issuer:                                 BASE_URL,
    // Browser-facing login page (React)
    authorization_endpoint:                `${BASE_URL}/oauth/authorize`,
    // JSON API endpoints
    token_endpoint:                         `${BASE_URL}/api/oauth/token`,
    registration_endpoint:                  `${BASE_URL}/api/oauth/register`,
    scopes_supported:                       ['mcp'],
    response_types_supported:              ['code'],
    grant_types_supported:                 ['authorization_code'],
    code_challenge_methods_supported:      ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  };
  log('DISCOVERY', 'Response', body);
  res.json(body);
}
