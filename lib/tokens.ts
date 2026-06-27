// Self-contained, HMAC-signed tokens — the foundation of statelessness.
//
// Instead of storing OAuth artifacts (registered clients, authorization codes,
// access tokens) in a database or in-memory map, we encode all of their state
// into the token string itself and protect it with an HMAC-SHA256 signature.
// Any server instance can mint and verify a token using only the shared secret,
// so no coordination or storage is needed between requests.
//
// Format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
import { createHmac, timingSafeEqual } from 'crypto';
import { SIGNING_SECRET } from './config';

// `kind` namespaces tokens so an access token can never be replayed as an
// authorization code (or vice versa), even though they share one secret.
export type TokenKind = 'client' | 'code' | 'access';

interface Envelope {
  kind: TokenKind;
  iat: number; // issued-at (unix seconds)
  exp?: number; // expiry (unix seconds), omitted for non-expiring tokens
}

export type Signed<T> = T & Envelope;

export function sign<T extends object>(
  kind: TokenKind,
  data: T,
  ttlSeconds?: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Signed<T> = {
    ...data,
    kind,
    iat: now,
    ...(ttlSeconds ? { exp: now + ttlSeconds } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SIGNING_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verify<T = Record<string, unknown>>(
  token: string,
  kind: TokenKind,
): Signed<T> | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac('sha256', SIGNING_SECRET).update(body).digest('base64url');
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  let payload: Signed<T>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (payload.kind !== kind) return null;
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}
