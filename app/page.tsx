import { BASE_URL, MCP_ENDPOINT } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function Home() {
  const wrap: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '44rem',
    margin: '3rem auto',
    padding: '0 1.25rem',
    lineHeight: 1.6,
    color: '#0f172a',
  };
  const code: React.CSSProperties = {
    background: '#f1f5f9',
    padding: '.15rem .4rem',
    borderRadius: 4,
    fontSize: '.9em',
  };

  return (
    <main style={wrap}>
      <h1>MCP OAuth Server — Next.js PoC</h1>
      <p>
        A fully <strong>stateless</strong> Model Context Protocol server protected by OAuth 2.0
        with Dynamic Client Registration and PKCE. No database, no in-memory state — every
        artifact (client_id, authorization code, access token) is a self-contained HMAC-signed
        token.
      </p>

      <h2>Connect from Claude Code</h2>
      <pre style={{ ...code, display: 'block', padding: '1rem', overflowX: 'auto' }}>
        claude mcp add --transport http mcp-oauth {MCP_ENDPOINT}
      </pre>
      <p>
        Claude Code performs the discovery → registration → authorize → token flow automatically.
        Sign in with <code style={code}>demo</code> / <code style={code}>demo</code> when the
        browser opens.
      </p>

      <h2>Endpoints</h2>
      <ul>
        <li>
          <code style={code}>{BASE_URL}/.well-known/oauth-protected-resource</code>
        </li>
        <li>
          <code style={code}>{BASE_URL}/.well-known/oauth-authorization-server</code>
        </li>
        <li>
          <code style={code}>{BASE_URL}/api/oauth/register</code> — DCR
        </li>
        <li>
          <code style={code}>{BASE_URL}/api/oauth/authorize</code> — login &amp; consent
        </li>
        <li>
          <code style={code}>{BASE_URL}/api/oauth/token</code> — token exchange
        </li>
        <li>
          <code style={code}>{MCP_ENDPOINT}</code> — MCP (Bearer required)
        </li>
      </ul>

      <p style={{ color: '#64748b', fontSize: '.9rem' }}>
        Proof of concept only. The signing secret and credentials are public and hardcoded.
      </p>
    </main>
  );
}
