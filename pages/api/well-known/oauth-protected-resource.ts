import type { NextApiRequest, NextApiResponse } from 'next';
import { log } from '../../../lib/logger';
import { BASE_URL } from '../../../lib/auth';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  log('DISCOVERY', 'Protected resource metadata requested');
  const body = {
    resource:                 BASE_URL,
    authorization_servers:    [BASE_URL],
    bearer_methods_supported: ['header'],
    scopes_supported:         ['mcp'],
  };
  log('DISCOVERY', 'Response', body);
  res.json(body);
}
