// OAuth 2.0 token endpoint (RFC 6749 §3.2) — authorization_code grant + PKCE.
//
// Verifies the signed authorization code, checks the PKCE verifier, and mints a
// signed access token. No code is "consumed" from storage because there is no
// storage; the code's short TTL bounds replay instead. (A real server would
// track one-time use — an accepted tradeoff for statelessness here.)
import { NextResponse } from 'next/server';
import { sign, verify } from '@/lib/tokens';
import { verifyPkce } from '@/lib/pkce';
import { SCOPE, ACCESS_TOKEN_TTL_SECONDS } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AuthCode {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  user: string;
}

function tokenError(error: string, description?: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  // Per RFC 6749 the body is form-encoded; we also accept JSON for convenience.
  const params: Record<string, string> = {};
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      Object.assign(params, await req.json());
    } catch {
      return tokenError('invalid_request', 'Malformed JSON body.');
    }
  } else {
    const form = await req.formData();
    for (const [k, v] of form.entries()) params[k] = v as string;
  }

  if (params.grant_type !== 'authorization_code') {
    return tokenError('unsupported_grant_type', 'Only authorization_code is supported.');
  }

  const code = verify<AuthCode>(params.code || '', 'code');
  if (!code) {
    return tokenError('invalid_grant', 'Authorization code is invalid or expired.');
  }

  // The redirect_uri, if presented, must match the one bound into the code.
  if (params.redirect_uri && params.redirect_uri !== code.redirect_uri) {
    return tokenError('invalid_grant', 'redirect_uri does not match the authorization request.');
  }

  // The client_id, if presented, must match too.
  if (params.client_id && params.client_id !== code.client_id) {
    return tokenError('invalid_grant', 'client_id does not match the authorization request.');
  }

  // PKCE: required whenever a challenge was supplied at /authorize.
  if (code.code_challenge) {
    const verifier = params.code_verifier || '';
    if (!verifier) {
      return tokenError('invalid_request', 'code_verifier is required.');
    }
    if (!verifyPkce(verifier, code.code_challenge, code.code_challenge_method)) {
      return tokenError('invalid_grant', 'PKCE verification failed.');
    }
  }

  const scope = code.scope || SCOPE;
  const access_token = sign('access', { user: code.user, scope }, ACCESS_TOKEN_TTL_SECONDS);

  return NextResponse.json(
    {
      access_token,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
