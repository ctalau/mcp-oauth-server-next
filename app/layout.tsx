import type { ReactNode } from 'react';

export const metadata = {
  title: 'MCP OAuth Server (Next.js PoC)',
  description: 'A stateless MCP server with OAuth 2.0 + Dynamic Client Registration.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
