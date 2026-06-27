# MCP OAuth Server — Next.js, Stateless PoC

A proof-of-concept [Model Context Protocol](https://modelcontextprotocol.io)
server deployed on Vercel that requires OAuth 2.0 before any tool can be called.
It demonstrates the full authentication flow Claude Code runs automatically:
discovery → Dynamic Client Registration → PKCE authorization → Bearer token.

**Live:** https://mcp-oauth-server-next.vercel.app
**Tool:** `get_current_day` — returns today's date.

## Hard requirement: completely stateless

There is **no database and no in-memory map** — not even for clients, auth
codes, or tokens. Every OAuth artifact is a self-contained, HMAC-SHA256-signed
token that any serverless instance can mint and verify from the shared secret
alone:

| Artifact            | What it encodes                                            | TTL    |
| ------------------- | --------------------------------------------------------- | ------ |
| `client_id` (DCR)   | `redirect_uris`, `client_name`                            | none   |
| authorization code  | `client_id`, `redirect_uri`, PKCE challenge, scope, user  | 10 min |
| access token        | `user`, `scope`                                           | 1 hour |

See `lib/tokens.ts`. The format is `base64url(json) . base64url(hmac)`.

### Accepted security tradeoffs (PoC only)

- The signing secret and the `demo` / `demo` credentials are **hardcoded and
  public** (`lib/config.ts`).
- Authorization codes are **not single-use** — statelessness means there is
  nowhere to record consumption, so the short TTL bounds replay instead.
- No token revocation, no refresh tokens, single demo user.

## How it works

```
Claude Code                         This server (Next.js App Router)
───────────                         ───────────────────────────────────────────
POST /api/mcp  (no token)  ───────► 401 + WWW-Authenticate: resource_metadata=…
GET  /.well-known/oauth-protected-resource ──► { resource, authorization_servers }
GET  /.well-known/oauth-authorization-server ► { *_endpoint, S256, … }
POST /api/oauth/register   ───────► signed client_id  (DCR, RFC 7591)
GET  /api/oauth/authorize  ───────► login page  (demo / demo)
POST /api/oauth/authorize  ───────► 302 redirect_uri?code=…&state=…
POST /api/oauth/token      ───────► verify PKCE → signed access_token
POST /api/mcp  (Bearer)    ───────► JSON-RPC: initialize / tools/list / tools/call
```

Relevant specs: RFC 9728 (protected resource metadata), RFC 8414 (AS metadata),
RFC 7591 (DCR), RFC 7636 (PKCE).

## Project layout

```
app/
  page.tsx                                      landing page
  api/mcp/route.ts                              protected MCP JSON-RPC endpoint
  api/oauth/register/route.ts                   Dynamic Client Registration
  api/oauth/authorize/route.ts                  login page + code issuance
  api/oauth/token/route.ts                      code → access token (+ PKCE)
  api/well-known/oauth-protected-resource/      RFC 9728 doc
  api/well-known/oauth-authorization-server/    RFC 8414 doc
lib/
  config.ts     hardcoded settings (URL, secret, credentials, TTLs)
  tokens.ts     sign() / verify() — the statelessness primitive
  pkce.ts       S256 verification
test/
  e2e.mjs       full-flow test against the live deployment
```

`/.well-known/*` URLs are served via rewrites in `next.config.js` (Next.js
ignores dot-prefixed folders inside `app/`).

## Connect from Claude Code

```bash
claude mcp add --transport http mcp-oauth https://mcp-oauth-server-next.vercel.app/api/mcp
```

Claude Code runs the whole flow for you; sign in with `demo` / `demo` when the
browser opens.

## Test

```bash
npm test                 # runs against the live Vercel deployment
MCP_BASE_URL=http://localhost:3000 npm test    # or a local `npm run dev`
```

The test exercises discovery, DCR, the PKCE authorize + token exchange, the
three MCP methods, and the negative cases (bad password, bad PKCE verifier,
invalid token).

## Develop / deploy

```bash
npm install
npm run dev              # http://localhost:3000
```

Deploy by importing the repo into Vercel — no environment variables required.
Everything is hardcoded in `lib/config.ts`; if you fork to a different domain,
update `BASE_URL` there.
