import type { NextApiRequest, NextApiResponse } from 'next';
import { store } from '../../lib/store';
import { log } from '../../lib/logger';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const body = {
    server:  'mcp-oauth-next',
    version: '1.0.0',
    uptime:  `${Math.round(process.uptime())}s`,
    stats: {
      clients:      store.clients.size,
      auth_codes:   store.authCodes.size,
      tokens:       store.tokens.size,
      mcp_sessions: store.transports.size,
    },
  };
  log('STATUS', 'Status requested', body.stats);
  res.json(body);
}
