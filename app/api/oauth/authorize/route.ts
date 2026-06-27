// OAuth 2.0 authorization endpoint (RFC 6749 §3.1) with PKCE.
//
//   GET  → render a login page (carrying the request params as hidden fields)
//   POST → check credentials, mint a signed authorization code, 302 back to the
//          client's redirect_uri with ?code=...&state=...
//
// The authorization code is self-contained: it encodes the client_id,
// redirect_uri, PKCE challenge, scope and the authenticated user, so the token
// endpoint can validate the exchange without any server-side state.
import { NextResponse } from 'next/server';
import { sign, verify } from '@/lib/tokens';
import { DEMO_USER, SCOPE, AUTH_CODE_TTL_SECONDS } from '@/lib/config';
import type { ClientMetadata } from '../register/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AuthParams {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  response_type: string;
}

function htmlError(message: string, status = 400) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Authorization error</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
      `<h1>Authorization error</h1><p>${escapeHtml(message)}</p></body>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const p: AuthParams = {
    client_id: q.get('client_id') ?? '',
    redirect_uri: q.get('redirect_uri') ?? '',
    state: q.get('state') ?? '',
    code_challenge: q.get('code_challenge') ?? '',
    code_challenge_method: q.get('code_challenge_method') ?? 'S256',
    scope: q.get('scope') ?? SCOPE,
    response_type: q.get('response_type') ?? 'code',
  };

  const client = verify<ClientMetadata>(p.client_id, 'client');
  if (!client) return htmlError('Invalid or unknown client_id.');
  if (!client.redirect_uris.includes(p.redirect_uri)) {
    return htmlError('The redirect_uri is not registered for this client.');
  }
  if (p.response_type !== 'code') {
    return htmlError('Only response_type=code is supported.');
  }

  return loginPage(client.client_name, p);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const f = (k: string) => (form.get(k) as string | null) ?? '';
  const p: AuthParams = {
    client_id: f('client_id'),
    redirect_uri: f('redirect_uri'),
    state: f('state'),
    code_challenge: f('code_challenge'),
    code_challenge_method: f('code_challenge_method') || 'S256',
    scope: f('scope') || SCOPE,
    response_type: 'code',
  };

  const client = verify<ClientMetadata>(p.client_id, 'client');
  if (!client) return htmlError('Invalid or unknown client_id.');
  if (!client.redirect_uris.includes(p.redirect_uri)) {
    return htmlError('The redirect_uri is not registered for this client.');
  }

  const username = f('username');
  const password = f('password');
  if (username !== DEMO_USER.username || password !== DEMO_USER.password) {
    return loginPage(client.client_name, p, 'Invalid credentials — try demo / demo.', 401);
  }

  // Mint the authorization code. Everything the token endpoint needs is inside.
  const code = sign(
    'code',
    {
      client_id: p.client_id,
      redirect_uri: p.redirect_uri,
      code_challenge: p.code_challenge,
      code_challenge_method: p.code_challenge_method,
      scope: p.scope,
      user: username,
    },
    AUTH_CODE_TTL_SECONDS,
  );

  const location = new URL(p.redirect_uri);
  location.searchParams.set('code', code);
  if (p.state) location.searchParams.set('state', p.state);

  return NextResponse.redirect(location.toString(), 302);
}

function loginPage(clientName: string, p: AuthParams, error?: string, status = 200) {
  const hidden = (name: string, value: string) =>
    value ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — MCP OAuth PoC</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0;
           display:flex; min-height:100vh; margin:0; align-items:center; justify-content:center; }
    .card { background:#1e293b; padding:2rem; border-radius:12px; width:22rem;
            box-shadow:0 10px 40px rgba(0,0,0,.4); }
    h1 { font-size:1.2rem; margin:0 0 .25rem; }
    p.sub { margin:0 0 1.5rem; color:#94a3b8; font-size:.9rem; }
    label { display:block; font-size:.8rem; color:#94a3b8; margin:.75rem 0 .25rem; }
    input[type=text], input[type=password] { width:100%; box-sizing:border-box; padding:.6rem;
            border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; }
    button { width:100%; margin-top:1.5rem; padding:.7rem; border:0; border-radius:8px;
             background:#6366f1; color:white; font-weight:600; cursor:pointer; }
    button:hover { background:#4f46e5; }
    .err { background:#7f1d1d; color:#fecaca; padding:.6rem; border-radius:8px;
           font-size:.85rem; margin-bottom:1rem; }
    .hint { margin-top:1rem; font-size:.8rem; color:#64748b; text-align:center; }
    code { background:#0f172a; padding:.1rem .3rem; border-radius:4px; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/api/oauth/authorize">
    <h1>Authorize access</h1>
    <p class="sub"><strong>${escapeHtml(clientName)}</strong> wants to access the MCP server.</p>
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
    <label for="username">Username</label>
    <input id="username" name="username" type="text" autocomplete="username" autofocus value="demo">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" value="demo">
    ${hidden('client_id', p.client_id)}
    ${hidden('redirect_uri', p.redirect_uri)}
    ${hidden('state', p.state)}
    ${hidden('code_challenge', p.code_challenge)}
    ${hidden('code_challenge_method', p.code_challenge_method)}
    ${hidden('scope', p.scope)}
    <button type="submit">Sign in &amp; authorize</button>
    <p class="hint">Demo credentials: <code>demo</code> / <code>demo</code></p>
  </form>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
