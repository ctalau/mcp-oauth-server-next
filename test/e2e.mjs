#!/usr/bin/env node
// End-to-end test for the deployed MCP OAuth server.
//
// Drives the exact flow Claude Code performs, against the live Vercel
// deployment (override with MCP_BASE_URL for a different target):
//
//   1. Unauthenticated MCP call is rejected with a discovery hint
//   2. Protected-resource + authorization-server metadata are well-formed
//   3. Dynamic Client Registration
//   4. PKCE authorize (GET page + POST login) yields an authorization code
//   5. Token exchange (with PKCE) yields an access token
//   6. Authenticated MCP calls: initialize / tools/list / tools/call
//   7. Negative cases: bad password, bad PKCE verifier, invalid token
//
// Requires Node 18+ (global fetch / crypto). Run: `npm test`.
import crypto from 'node:crypto';

const BASE = (process.env.MCP_BASE_URL || 'https://mcp-oauth-server-next.vercel.app').replace(/\/$/, '');
const MCP = `${BASE}/api/mcp`;
const REDIRECT_URI = 'http://localhost:9876/callback';

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail !== undefined ? `  (${JSON.stringify(detail)})` : ''}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const b64url = (buf) => buf.toString('base64url');

function mcpCall(token, message) {
  return fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(message),
  });
}

async function parseMcp(res) {
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  if (ct.includes('text/event-stream')) {
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
    return dataLine ? JSON.parse(dataLine.slice(5).trim()) : null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\nMCP OAuth e2e — target: ${BASE}`);

  // 1. Unauthenticated MCP request --------------------------------------------
  section('1. Unauthenticated MCP request is rejected');
  let res = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  check('responds 401', res.status === 401, res.status);
  const wwwAuth = res.headers.get('www-authenticate') || '';
  check('WWW-Authenticate advertises resource_metadata', /resource_metadata=/.test(wwwAuth), wwwAuth);

  // 2. Discovery metadata ------------------------------------------------------
  section('2. Discovery metadata');
  res = await fetch(`${BASE}/.well-known/oauth-protected-resource`);
  check('protected-resource 200', res.status === 200, res.status);
  const prm = await res.json();
  check('resource == MCP endpoint', prm.resource === MCP, prm.resource);
  check(
    'lists authorization server',
    Array.isArray(prm.authorization_servers) && prm.authorization_servers.includes(BASE),
    prm.authorization_servers,
  );

  res = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
  check('authorization-server 200', res.status === 200, res.status);
  const asm = await res.json();
  check('has registration_endpoint', typeof asm.registration_endpoint === 'string');
  check('has authorization_endpoint', typeof asm.authorization_endpoint === 'string');
  check('has token_endpoint', typeof asm.token_endpoint === 'string');
  check('supports PKCE S256', (asm.code_challenge_methods_supported || []).includes('S256'));

  // 3. Dynamic Client Registration --------------------------------------------
  section('3. Dynamic Client Registration');
  res = await fetch(asm.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'e2e-test-client', redirect_uris: [REDIRECT_URI] }),
  });
  check('register 201', res.status === 201, res.status);
  const reg = await res.json();
  check('returns client_id', typeof reg.client_id === 'string' && reg.client_id.length > 0);
  check('echoes redirect_uris', JSON.stringify(reg.redirect_uris) === JSON.stringify([REDIRECT_URI]), reg.redirect_uris);

  // missing redirect_uris is rejected
  res = await fetch(asm.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'no-redirect' }),
  });
  check('register without redirect_uris 400', res.status === 400, res.status);

  // 4. Authorize (PKCE) --------------------------------------------------------
  section('4. Authorization with PKCE');
  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = b64url(crypto.randomBytes(8));

  const authUrl = new URL(asm.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', reg.client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', 'mcp');

  res = await fetch(authUrl);
  check('authorize page 200', res.status === 200, res.status);
  const page = await res.text();
  check('renders a login form', /<form/i.test(page));

  // wrong password must not yield a code
  const badForm = new URLSearchParams({
    client_id: reg.client_id,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'mcp',
    username: 'demo',
    password: 'WRONG',
  });
  res = await fetch(asm.authorization_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: badForm.toString(),
    redirect: 'manual',
  });
  check('wrong password does not redirect', res.status !== 302, res.status);

  // correct credentials yield a redirect with ?code
  const form = new URLSearchParams({
    client_id: reg.client_id,
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'mcp',
    username: 'demo',
    password: 'demo',
  });
  res = await fetch(asm.authorization_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    redirect: 'manual',
  });
  check('login redirects (3xx)', res.status >= 300 && res.status < 400, res.status);
  const location = res.headers.get('location') || '';
  const redirected = new URL(location);
  const authCode = redirected.searchParams.get('code');
  check('redirect carries ?code', !!authCode);
  check('redirect preserves state', redirected.searchParams.get('state') === state, redirected.searchParams.get('state'));

  // 5. Token exchange ----------------------------------------------------------
  section('5. Token exchange');
  // wrong PKCE verifier is rejected
  res = await fetch(asm.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      client_id: reg.client_id,
      code_verifier: 'incorrect-verifier',
    }).toString(),
  });
  check('bad PKCE verifier 400', res.status === 400, res.status);

  // correct exchange
  res = await fetch(asm.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      client_id: reg.client_id,
      code_verifier: codeVerifier,
    }).toString(),
  });
  check('token 200', res.status === 200, res.status);
  const tok = await res.json();
  check('returns access_token', typeof tok.access_token === 'string' && tok.access_token.length > 0);
  check('token_type is Bearer', tok.token_type === 'Bearer', tok.token_type);
  const accessToken = tok.access_token;

  // 6. Authenticated MCP calls -------------------------------------------------
  section('6. Authenticated MCP calls');
  let j = await parseMcp(
    await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } },
    }),
  );
  check('initialize returns serverInfo', j?.result?.serverInfo?.name === 'mcp-oauth-server-next', j);

  j = await parseMcp(await mcpCall(accessToken, { jsonrpc: '2.0', id: 2, method: 'tools/list' }));
  const tools = j?.result?.tools || [];
  check('tools/list includes get_current_day', tools.some((t) => t.name === 'get_current_day'), tools);

  j = await parseMcp(
    await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_current_day', arguments: {} },
    }),
  );
  const text = j?.result?.content?.[0]?.text || '';
  check('get_current_day returns a date', /Today is/.test(text), text);

  // 7. Invalid token -----------------------------------------------------------
  section('7. Invalid token is rejected');
  res = await mcpCall('totally.invalid', { jsonrpc: '2.0', id: 4, method: 'tools/list' });
  check('invalid token 401', res.status === 401, res.status);

  // Summary --------------------------------------------------------------------
  console.log(`\n${failed === 0 ? '✅ ALL PASSED' : '❌ FAILURES'} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nTest run crashed:', err);
  process.exit(1);
});
