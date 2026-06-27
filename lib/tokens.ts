// Stateless signed tokens — all state is encoded in the token itself.
// Set MCP_SECRET in Vercel env vars. The dev default resets on every cold start
// (tokens from a previous deploy won't verify), which is acceptable for a PoC.
import crypto from 'crypto';

const SECRET = process.env.MCP_SECRET ?? 'dev-secret-change-in-production';

export function createToken(payload: Record<string, unknown>, ttlMs?: number): string {
  const data = ttlMs ? { ...payload, exp: Date.now() + ttlMs } : payload;
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function verifyToken<T = Record<string, any>>(token: string): T | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;

  const encoded = token.slice(0, dot);
  const sig     = token.slice(dot + 1);

  const expected = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  try {
    // Constant-time compare to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'ascii'), Buffer.from(expected, 'ascii'))) return null;
  } catch { return null; }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as T & { exp?: number | undefined };
    if (payload.exp !== undefined && Date.now() > payload.exp) return null;
    return payload as T;
  } catch { return null; }
}
