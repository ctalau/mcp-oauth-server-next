// Hardcoded PoC configuration — no environment variables required.
//
// Everything here is intentionally baked in so the deployment is reproducible
// and so that signed tokens remain verifiable across serverless cold starts
// (there is no shared storage to fall back on). This is a proof of concept:
// the secret and credentials below are PUBLIC and MUST NOT be used in prod.

// The canonical, deployed origin. The whole OAuth flow is anchored to this URL.
export const BASE_URL = 'https://mcp-oauth-server-next.vercel.app';

// The protected resource: the MCP Streamable HTTP endpoint clients connect to.
export const MCP_ENDPOINT = `${BASE_URL}/api/mcp`;

// Single demo identity. The authorize page accepts only these credentials.
export const DEMO_USER = { username: 'demo', password: 'demo' };

// HMAC key for self-contained signed tokens (client_id, auth codes, access
// tokens). Hardcoded on purpose — see the file header.
export const SIGNING_SECRET = 'mcp-oauth-poc-signing-secret-v1-not-for-production';

// The only scope this server understands.
export const SCOPE = 'mcp';

// Lifetimes.
export const AUTH_CODE_TTL_SECONDS = 600; // 10 minutes
export const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
