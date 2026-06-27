// RFC 7636 — Proof Key for Code Exchange.
//
// The client sends a `code_challenge` at /authorize and the matching
// `code_verifier` at /token. We recompute the challenge from the verifier and
// compare. This binds the authorization code to the client that started the
// flow, which matters here because we issue tokens to public clients with no
// client secret.
import { createHash } from 'crypto';

export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }
  // Default and only method advertised in our metadata: S256.
  const hashed = createHash('sha256').update(codeVerifier).digest('base64url');
  return hashed === codeChallenge;
}
