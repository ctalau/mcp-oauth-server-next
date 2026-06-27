# MCP OAuth Server — Design Document

**Status:** Implemented (PoC)
**Author:** cristitalau@gmail.com
**Last updated:** 2026-06-27

---

## Overview

A proof-of-concept HTTP MCP server deployed on Vercel that requires OAuth 2.0
authentication before any tool can be used. It demonstrates the full
authentication flow that Claude Code performs automatically when connecting to
a remote MCP server: discovery, Dynamic Client Registration, PKCE authorization,
and Bearer token verification.

The server exposes a single tool, `get_current_day`, which returns today's date.

### Goals

- Understand how Claude Code performs OAuth against a remote MCP server.
- Demonstrate a fully stateless OAuth implementation suitable for serverless
  deployment (no database, no Redis, no shared memory).
- Serve as a reference for the MCP Streamable HTTP transport + OAuth 2.0 pattern.

### Non-goals

- Production security (hardcoded HMAC secret, no token revocation, no rate
  limiting, `user/user` credentials).
- Multi-user or multi-tenant support.
- Refresh tokens or token rotation.

---

## Background

The Model Context Protocol (MCP) defines a Streamable HTTP transport where
clients POST JSON-RPC messages to a single endpoint. When that endpoint is
protected, the MCP spec follows the OAuth 2.0 discovery chain defined by:

- **RFC 9728** — OAuth 2.0 Protected Resource Metadata
- **RFC 8414** — OAuth 2.0 Authorization Server Metadata
- **RFC 7591** — OAuth 2.0 Dynamic Client Registration
- **RFC 7636** — PKCE (Proof Key for Code Exchange)

Claude Code implements this chain automatically: when a `401` response carries
a `WWW-Authenticate: Bearer resource_metadata=<url>` header, Claude Code
fetches the metadata, registers itself as a client, opens the authorization URL
in a browser, exchanges the code for a token, and retries the original request.

A serverless deployment (Vercel) cannot keep in-memory state between requests,
which rules out the typical pattern of storing auth codes and access tokens in
Maps. This server solves that with **self-contained signed tokens** — all state
is encoded in the token payload and verified with an HMAC-SHA256 signature.

---

## Architecture

```
Claude Code                Vercel (Next.js)
──────────                 ───────────────────────────────────────────────

POST /api/mcp ──────────► lib/auth.ts  (withAuth middleware)
  (no token)               │  verifyToken → null
                           └─► 401  WWW-Authenticate: Bearer resource_metadata=…

GET /.well-known/          next.config.js rewrite
  oauth-protected-resource ──► /api/well-known/oauth-protected-resource
                               Returns: { resource, authorization_servers }

GET /.well-known/
  oauth-authorization-server ► /api/well-known/oauth-authorization-server
                               Returns: { issuer, authorization_endpoint,
                                          token_endpoint, registration_endpoint }

POST /api/oauth/register ──► DCR: encode client metadata → signed client_id
                             Returns: { client_id, redirect_uris, … }

GET /oauth/authorize ──────► pages/oauth/authorize.tsx  (React login page)
  (browser)                  getServerSideProps decodes client_id → client_name

POST /api/oauth/authorize ─► validate credentials (user/user)
  (form submit)              verify client_id signature
                             issue signed auth code (10 min TTL)
                             302 → redirect_uri?code=…&state=…

POST /api/oauth/token ─────► decode auth code, verify PKCE S256
                             issue signed access token (1 hr TTL)
                             Returns: { access_token, token_type, expires_in }

POST /api/mcp ─────────────► lib/auth.ts verifyToken → user
  (Bearer token)             pages/api/mcp.ts JSON-RPC dispatch
                             Returns: { jsonrpc, id, result }
```

### Key design decisions

**Stateless tokens (signed payloads)**

Every piece of state — client registrations, auth codes, access tokens — is
encoded directly in the token string as a base64url-encoded JSON payload with
an HMAC-SHA256 signature. No database or cache is needed. The trade-off is that
auth codes cannot be revoked within their TTL window (10 minutes).

```
token = base64url(JSON(payload)) + "." + HMAC-SHA256(base64url(JSON(payload)))
```

`lib/tokens.ts` implements `createToken` and `verifyToken`. The HMAC secret is
hardcoded (`poc-secret-not-for-production`); in production it should be an
environment variable rotated independently of deployments.

**Direct JSON-RPC handler (no SDK session)**

The `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport` keeps session
state in memory, which is incompatible with serverless. `pages/api/mcp.ts`
implements the Streamable HTTP protocol directly as a switch-case over
JSON-RPC method names. An `mcp-session-id` header is issued on `initialize`
for protocol compatibility, but no session is tracked server-side.

**`/.well-known` routing**

Next.js ignores directories whose names start with a dot, so
`pages/api/.well-known/` would not be routed. The well-known endpoints live at
`pages/api/well-known/` and are mapped via rewrites in `next.config.js`:

```js
{ source: '/.well-known/:path*', destination: '/api/well-known/:path*' }
```

**BASE_URL auto-detection**

The OAuth metadata must contain absolute URLs. The server resolves `BASE_URL`
in priority order:

1. `BASE_URL` environment variable (explicit override)
2. `VERCEL_PROJECT_PRODUCTION_URL` (stable production domain, set by Vercel)
3. `VERCEL_URL` (deployment-specific domain, set by Vercel)
4. `http://localhost:3000` (local dev fallback)

---

## File structure

```
pages/
  api/
    mcp.ts                      MCP endpoint — JSON-RPC dispatch + auth guard
    oauth/
      authorize.ts              Authorization endpoint (POST — form handler)
      register.ts               Dynamic Client Registration (POST)
      token.ts                  Token endpoint (POST — code → access token)
    well-known/
      oauth-authorization-server.ts   RFC 8414 metadata
      oauth-protected-resource.ts     RFC 9728 metadata
    status.ts                   Health check (unauthenticated)
  oauth/
    authorize.tsx               Login page (React SSR)

lib/
  auth.ts                       Bearer token middleware + BASE_URL resolution
  tokens.ts                     HMAC-SHA256 token creation and verification
  logger.ts                     File logger → /tmp/mcp-auth.log
  store.ts                      (unused — kept as reference for stateful version)

test/
  e2e.js                        End-to-end test (no dependencies, plain Node.js)

next.config.js                  /.well-known rewrites
```

---

## Token types

All tokens share the same signing scheme. The `type` field distinguishes them.

| Type | Issued by | TTL | Fields |
|---|---|---|---|
| `client` | `/api/oauth/register` | none | `type`, `client_name`, `redirect_uris`, `grant_types` |
| `code` | `/api/oauth/authorize` | 10 min | `type`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method`, `user` |
| `token` | `/api/oauth/token` | 1 hour | `type`, `user`, `scope` |

---

## OAuth flow (step by step)

1. **Claude Code** sends `POST /api/mcp` with no token.
2. **Server** returns `401` with `WWW-Authenticate: Bearer realm="mcp", resource_metadata="https://…/.well-known/oauth-protected-resource"`.
3. **Claude Code** fetches `/.well-known/oauth-protected-resource` → discovers the authorization server URL.
4. **Claude Code** fetches `/.well-known/oauth-authorization-server` → discovers `registration_endpoint`, `authorization_endpoint`, `token_endpoint`.
5. **Claude Code** POSTs to `/api/oauth/register` → receives a signed `client_id`.
6. **Claude Code** opens `https://…/oauth/authorize?client_id=…&code_challenge=…` in the system browser.
7. **User** enters `user` / `user` and clicks Sign in.
8. **Server** validates credentials, verifies the `client_id` signature, and redirects to `redirect_uri?code=…`.
9. **Claude Code** exchanges the code at `/api/oauth/token` with the PKCE verifier → receives `access_token`.
10. **Claude Code** retries `POST /api/mcp` with `Authorization: Bearer <token>`.
11. **Server** verifies the token signature and expiry, dispatches the JSON-RPC method.

---

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
node test/e2e.js http://localhost:3000
```

## Running the test suite against production

```bash
node test/e2e.js
# or explicitly:
node test/e2e.js https://mcp-oauth-server-next.vercel.app
```

## Connecting Claude Code

The server is registered in `~/.claude.json` as:

```json
{
  "mcp-oauth-poc": {
    "type": "http",
    "url": "https://mcp-oauth-server-next.vercel.app/api/mcp"
  }
}
```

On first use Claude Code will open the login page automatically.
Credentials: **user** / **user**.

---

## Security considerations (PoC limitations)

| Concern | PoC approach | Production approach |
|---|---|---|
| HMAC secret | Hardcoded in source | Environment variable, rotated independently |
| Credentials | `user/user` hardcoded | Proper identity provider / hashed passwords |
| Auth code reuse | Replayable within 10-min TTL | One-time codes (requires storage) |
| Token revocation | Not supported | Revocation list or short-lived tokens |
| HTTPS | Enforced by Vercel | Enforce at the load balancer |
