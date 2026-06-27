// RFC 7591 — OAuth 2.0 Dynamic Client Registration.
//
// Stateless twist: instead of persisting the client record and returning a
// random id that we'd later look up, we make the client_id *be* the client
// record — a signed token carrying the registered redirect_uris and name.
// Later endpoints simply verify the signature to recover trusted metadata, so
// no storage is needed.
import { NextResponse } from 'next/server';
import { sign } from '@/lib/tokens';
import { SCOPE } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface ClientMetadata {
  redirect_uris: string[];
  client_name: string;
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // tolerate empty/invalid body; validated below
  }

  const redirect_uris = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter((u): u is string => typeof u === 'string')
    : [];

  if (redirect_uris.length === 0) {
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: 'At least one redirect_uri is required.',
      },
      { status: 400 },
    );
  }

  const client_name =
    typeof body.client_name === 'string' && body.client_name ? body.client_name : 'mcp-client';

  // The signed client_id never expires — registrations are durable.
  const client_id = sign<ClientMetadata>('client', { redirect_uris, client_name });

  return NextResponse.json(
    {
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name,
      redirect_uris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    },
    { status: 201 },
  );
}
