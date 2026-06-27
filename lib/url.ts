// Resolve the origin to anchor OAuth URLs to.
//
// We prefer the actual request host (so the same code works locally, in preview
// deploys, and in production with no env vars) and fall back to the hardcoded
// canonical BASE_URL. This is not an env var — it's read from the inbound
// request — so it stays consistent with the "hardcode settings" requirement.
import { BASE_URL } from './config';

export function originFromRequest(req: Request): string {
  const host = req.headers.get('host');
  if (!host) return BASE_URL;
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const proto = req.headers.get('x-forwarded-proto') || (isLocal ? 'http' : 'https');
  return `${proto}://${host}`;
}
