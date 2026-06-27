// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
//
// This is the document Claude Code fetches after it sees the
// `WWW-Authenticate: Bearer resource_metadata=...` header on a 401. It points
// the client at the authorization server(s) that can mint tokens for us.
//
// Served at the canonical /.well-known/oauth-protected-resource via a rewrite
// (see next.config.js).
import { NextResponse } from 'next/server';
import { SCOPE } from '@/lib/config';
import { originFromRequest } from '@/lib/url';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const origin = originFromRequest(req);
  return NextResponse.json({
    // The resource identifier MUST be the exact MCP endpoint URL so the token
    // audience lines up with what the client connects to.
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
  });
}
