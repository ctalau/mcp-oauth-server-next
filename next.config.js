/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // /.well-known/* can't live in app/ (dot-prefix ignored by Next.js),
      // so we rewrite to API routes and keep the canonical URLs.
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
