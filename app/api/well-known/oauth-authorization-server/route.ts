// RFC 8414 — OAuth 2.0 Authorization Server Metadata.
//
// Tells the client where to register (RFC 7591), where to send the user to
// authorize, and where to exchange the code for a token. Served at the
// canonical /.well-known/oauth-authorization-server via a rewrite.
import { NextResponse } from 'next/server';
import { SCOPE } from '@/lib/config';
import { originFromRequest } from '@/lib/url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const origin = originFromRequest(req);
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    // Public clients only — DCR hands out a client_id but no secret, and PKCE
    // does the work of binding the code to the client.
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  });
}
