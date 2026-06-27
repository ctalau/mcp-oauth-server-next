import type { GetServerSideProps } from 'next';
import Head from 'next/head';

interface Props {
  clientName: string;
  q: {
    client_id: string;
    redirect_uri: string;
    response_type: string;
    scope: string;
    state: string;
    code_challenge: string;
    code_challenge_method: string;
  };
  error?: string | null;
}

export default function AuthorizePage({ clientName, q, error }: Props) {
  return (
    <>
      <Head>
        <title>Sign in — MCP OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f0f2f5;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .card {
          background: #fff;
          border-radius: 12px;
          padding: 2rem;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 4px 24px rgba(0,0,0,.10);
        }
        h1 { font-size: 1.5rem; color: #111; margin-bottom: .25rem; }
        .sub { color: #888; font-size: .875rem; margin-bottom: 1.5rem; }
        .app-badge {
          background: #eff3ff;
          border: 1px solid #c7d2fe;
          border-radius: 8px;
          padding: .75rem 1rem;
          margin-bottom: 1.5rem;
          font-size: .82rem;
        }
        .app-badge b { display: block; color: #1e1b4b; margin-bottom: .2rem; font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
        .app-badge span { color: #3730a3; font-weight: 600; }
        .error-box {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: .65rem 1rem;
          color: #b91c1c;
          font-size: .85rem;
          margin-bottom: 1rem;
        }
        .field { margin-bottom: 1rem; }
        label { display: block; font-size: .8rem; font-weight: 600; color: #374151; margin-bottom: .35rem; }
        input[type=text], input[type=password] {
          width: 100%;
          padding: .6rem .75rem;
          border: 1.5px solid #d1d5db;
          border-radius: 8px;
          font-size: .95rem;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.18); }
        button {
          width: 100%;
          padding: .7rem;
          background: #4f46e5;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: .95rem;
          font-weight: 600;
          cursor: pointer;
          margin-top: .25rem;
          transition: background .15s;
        }
        button:hover { background: #4338ca; }
        .hint { color: #9ca3af; font-size: .75rem; text-align: center; margin-top: 1rem; }
        .hint code { background: #f3f4f6; padding: .1rem .35rem; border-radius: 4px; font-family: monospace; }
      `}</style>

      <div className="card">
        <h1>Sign in</h1>
        <p className="sub">to continue to MCP OAuth PoC</p>

        <div className="app-badge">
          <b>Application requesting access</b>
          <span>{clientName}</span>
        </div>

        {error && <div className="error-box">{error}</div>}

        {/* Form POSTs to the API route; all OAuth params carried as hidden fields */}
        <form method="POST" action="/api/oauth/authorize">
          <input type="hidden" name="client_id"             value={q.client_id} />
          <input type="hidden" name="redirect_uri"          value={q.redirect_uri} />
          <input type="hidden" name="response_type"         value={q.response_type} />
          <input type="hidden" name="scope"                 value={q.scope} />
          <input type="hidden" name="state"                 value={q.state} />
          <input type="hidden" name="code_challenge"        value={q.code_challenge} />
          <input type="hidden" name="code_challenge_method" value={q.code_challenge_method} />

          <div className="field">
            <label htmlFor="username">Username</label>
            <input type="text" id="username" name="username"
              autoComplete="username" required autoFocus />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" name="password"
              autoComplete="current-password" required />
          </div>

          <button type="submit">Sign in</button>
        </form>

        <p className="hint">Credentials: <code>user</code> / <code>user</code></p>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => {
  // Dynamic imports keep server-only modules out of the client bundle.
  const { store } = await import('../../lib/store');
  const { log }   = await import('../../lib/logger');

  const client_id = (query.client_id as string) || '';
  const client    = store.clients.get(client_id);

  log('AUTH', `GET /oauth/authorize`, {
    client_id,
    client_found: !!client,
    redirect_uri: query.redirect_uri,
    has_pkce:     !!query.code_challenge,
  });

  return {
    props: {
      clientName: client?.client_name ?? 'Unknown Application',
      q: {
        client_id,
        redirect_uri:          (query.redirect_uri          as string) || '',
        response_type:         (query.response_type         as string) || 'code',
        scope:                 (query.scope                 as string) || '',
        state:                 (query.state                 as string) || '',
        code_challenge:        (query.code_challenge        as string) || '',
        code_challenge_method: (query.code_challenge_method as string) || '',
      },
      error: (query.error as string) || null,
    },
  };
};
