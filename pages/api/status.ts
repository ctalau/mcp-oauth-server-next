import type { NextApiRequest, NextApiResponse } from 'next';
import { log } from '../../lib/logger';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const body = {
    server:  'mcp-oauth-next',
    version: '1.0.0',
    mode:    'stateless',
    uptime:  `${Math.round(process.uptime())}s`,
    note:    'All state is encoded in signed tokens — no server-side storage.',
  };
  log('STATUS', 'Status requested');
  res.json(body);
}
