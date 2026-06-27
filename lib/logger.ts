import fs from 'fs';

const LOG_FILE = '/tmp/mcp-auth.log';

// Survives Next.js HMR hot-reloads — only initialise once per process.
declare global {
  var __logInit: boolean | undefined;
}

if (!global.__logInit) {
  fs.writeFileSync(
    LOG_FILE,
    `${'═'.repeat(70)}\n[${new Date().toISOString()}] MCP OAuth Next.js server starting\n${'═'.repeat(70)}\n`
  );
  global.__logInit = true;
}

export function log(label: string, msg: string, data?: unknown): void {
  const ts   = new Date().toISOString();
  let   line = `[${ts}] [${label.padEnd(10)}] ${msg}`;
  if (data !== undefined) {
    const extra = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    line += '\n' + extra.split('\n').map(l => '  ' + l).join('\n');
  }
  line += '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* non-fatal */ }
  process.stdout.write(line);
}
