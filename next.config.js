/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js ignores dot-prefixed folders in app/, so the OAuth discovery
  // documents (which MUST live under /.well-known/) are served by normal
  // route handlers and exposed at the canonical URLs via these rewrites.
  async rewrites() {
    return [
      {
        source: '/.well-known/oauth-protected-resource',
        destination: '/api/well-known/oauth-protected-resource',
      },
      {
        source: '/.well-known/oauth-authorization-server',
        destination: '/api/well-known/oauth-authorization-server',
      },
    ];
  },
};

module.exports = nextConfig;
