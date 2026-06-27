#!/usr/bin/env node
// End-to-end test for the MCP OAuth server.
// Runs the full flow: discovery → DCR → login → PKCE token exchange → MCP calls.
// Usage: node test/e2e.js [BASE_URL]
//   Defaults to https://mcp-oauth-server-next.vercel.app

const https = require('https');
const http  = require('http');
const crypto = require('crypto');

const BASE = (process.argv[2] || 'https://mcp-oauth-server-next.vercel.app').replace(/\/$/, '');

let failures = 0;

function check(label, got, expected) {
  const ok = got === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got}${ok ? '' : ` (expected ${expected})`}`);
  if (!ok) failures++;
}

function req(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
      port:     u.port || undefined,
      path:     u.pathname + u.search,
      method:   opts.method || 'GET',
      headers:  { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    };
    const r = lib.request(options, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

async function main() {
  console.log(`Testing: ${BASE}\n`);

  // ── 1. Protected resource metadata ────────────────────────────────────────
  let r = await req(`${BASE}/.well-known/oauth-protected-resource`);
  const prm = JSON.parse(r.body);
  console.log('1. /.well-known/oauth-protected-resource');
  check('resource', prm.resource, `${BASE}/api/mcp`);
  check('auth_server', prm.authorization_servers[0], BASE);

  // ── 2. Authorization server metadata ──────────────────────────────────────
  r = await req(`${BASE}/.well-known/oauth-authorization-server`);
  const asm = JSON.parse(r.body);
  console.log('2. /.well-known/oauth-authorization-server');
  check('issuer', asm.issuer, BASE);
  check('token_endpoint', asm.token_endpoint, `${BASE}/api/oauth/token`);
  check('registration_endpoint', asm.registration_endpoint, `${BASE}/api/oauth/register`);
  check('authorization_endpoint', asm.authorization_endpoint, `${BASE}/oauth/authorize`);

  // ── 3. Dynamic Client Registration ────────────────────────────────────────
  r = await req(asm.registration_endpoint, {
    method: 'POST',
    body: JSON.stringify({
      client_name:   'e2e-test',
      redirect_uris: ['http://localhost:9999/cb'],
      grant_types:   ['authorization_code'],
    }),
  });
  const client = JSON.parse(r.body);
  console.log('3. Dynamic Client Registration');
  check('status', r.status, 201);
  check('client_id present', typeof client.client_id === 'string' && client.client_id.length > 0, true);

  // ── 4. Login + auth code (PKCE S256) ──────────────────────────────────────
  const verifier  = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state     = crypto.randomBytes(8).toString('hex');
  const loginForm = new URLSearchParams({
    client_id:             client.client_id,
    redirect_uri:          'http://localhost:9999/cb',
    response_type:         'code',
    scope:                 'mcp',
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    username:              'user',
    password:              'user',
  });
  r = await req(`${BASE}/api/oauth/authorize`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    loginForm.toString(),
  });
  const cbUrl = new URL(r.headers.location || 'http://x', 'http://x');
  const code  = cbUrl.searchParams.get('code');
  console.log('4. Login + PKCE (S256)');
  check('status', r.status, 302);
  check('code present', !!code, true);
  check('state echoed', cbUrl.searchParams.get('state'), state);

  // ── 5. Token exchange ──────────────────────────────────────────────────────
  const tokenForm = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  'http://localhost:9999/cb',
    client_id:     client.client_id,
    code_verifier: verifier,
  });
  r = await req(asm.token_endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    tokenForm.toString(),
  });
  const tokenResp = JSON.parse(r.body);
  console.log('5. Token exchange');
  check('status', r.status, 200);
  check('token_type', tokenResp.token_type, 'Bearer');
  check('expires_in', tokenResp.expires_in, 3600);
  const { access_token } = tokenResp;

  // ── 6–8. MCP calls ─────────────────────────────────────────────────────────
  const mcpPost = (id, method, params = {}) => req(`${BASE}/api/mcp`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  r = await mcpPost(1, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities:    {},
    clientInfo:      { name: 'e2e-test', version: '1.0' },
  });
  const init = JSON.parse(r.body);
  console.log('6. MCP initialize');
  check('status', r.status, 200);
  check('protocolVersion', init.result?.protocolVersion, '2025-03-26');
  check('serverName', init.result?.serverInfo?.name, 'mcp-oauth-next');
  check('session-id header', typeof r.headers['mcp-session-id'] === 'string', true);

  r = await mcpPost(2, 'tools/list');
  const tools = JSON.parse(r.body);
  console.log('7. tools/list');
  check('status', r.status, 200);
  check('tool name', tools.result?.tools?.[0]?.name, 'get_current_day');

  r = await mcpPost(3, 'tools/call', { name: 'get_current_day', arguments: {} });
  const call = JSON.parse(r.body);
  const text = call.result?.content?.[0]?.text ?? '';
  console.log('8. tools/call get_current_day');
  check('status', r.status, 200);
  check('isError', call.result?.isError, false);
  check('starts with Today is', text.startsWith('Today is'), true);
  console.log(`  → "${text}"`);

  // ── 9. Unauthenticated request ─────────────────────────────────────────────
  r = await req(`${BASE}/api/mcp`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping', params: {} }),
  });
  const wwwAuth = r.headers['www-authenticate'] ?? '';
  console.log('9. Unauthenticated request');
  check('status', r.status, 401);
  check('WWW-Authenticate has resource_metadata', wwwAuth.includes('resource_metadata='), true);

  // ── 10. PKCE failure (wrong verifier) ─────────────────────────────────────
  // Get a fresh code for this check
  const loginForm2 = new URLSearchParams({ ...Object.fromEntries(loginForm), state: crypto.randomBytes(8).toString('hex') });
  r = await req(`${BASE}/api/oauth/authorize`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    loginForm2.toString(),
  });
  const code2 = new URL(r.headers.location || 'http://x', 'http://x').searchParams.get('code');
  const badTokenForm = new URLSearchParams({
    grant_type: 'authorization_code', code: code2,
    redirect_uri: 'http://localhost:9999/cb', client_id: client.client_id,
    code_verifier: 'wrong-verifier',
  });
  r = await req(asm.token_endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    badTokenForm.toString(),
  });
  console.log('10. PKCE failure (wrong verifier)');
  check('status', r.status, 400);
  check('error', JSON.parse(r.body).error, 'invalid_grant');

  // ── Result ─────────────────────────────────────────────────────────────────
  console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ All checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
