// import type is erased at runtime — safe to reference in server code only.
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string;
  token_endpoint_auth_method: string;
  registered_at: string;
}

export interface AuthCode {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  user: string;
  created_at: number;
}

export interface AccessToken {
  client_id: string;
  user: string;
  scope: string;
  created_at: number;
  expires_in: number;
}

interface Store {
  clients:    Map<string, OAuthClient>;
  authCodes:  Map<string, AuthCode>;
  tokens:     Map<string, AccessToken>;
  transports: Map<string, StreamableHTTPServerTransport>;
}

declare global {
  var __mcpStore: Store | undefined;
}

// Singleton — persists across Next.js HMR cycles in development.
export const store: Store = global.__mcpStore ??= {
  clients:    new Map(),
  authCodes:  new Map(),
  tokens:     new Map(),
  transports: new Map(),
};
