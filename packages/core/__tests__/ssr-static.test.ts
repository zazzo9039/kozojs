// ============================================================================
// SSR production static serving — regression for the malformed-URL crash
// ============================================================================
//
// serveStaticFile() decodes the URL path with decodeURIComponent(). A malformed
// percent-encoding (e.g. "/assets/%zz") throws URIError. On the production SSR
// server this ran outside any try/catch, so the throw became an
// unhandledRejection and killed the process. A single crafted request could
// take the server down. It must answer 400 instead.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createSsrServer } from '../src/ssr.js';

function req(port: number, p: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method: 'GET' }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    r.on('error', reject);
    r.setTimeout(3000, () => { r.destroy(new Error('request timed out — server likely crashed')); });
    r.end();
  });
}

describe('SSR production static serving', () => {
  let root: string;
  let server: Server;
  let port: number;
  let prevEnv: string | undefined;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'kozo-ssr-static-'));
    fs.mkdirSync(path.join(root, 'dist/client'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist/server'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'dist/client/index.html'),
      '<html><body><!--app-html--></body></html>',
    );
    fs.writeFileSync(
      path.join(root, 'dist/server/entry-server.js'),
      'export function render(){ return { html: "<div>ok</div>" }; }',
    );

    const honoHandler = async (_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"api":true}');
    };

    const result = await createSsrServer(
      { root, entryServer: 'src/entry-server.tsx', logger: false },
      honoHandler,
      0,
    );
    server = result.server;
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server?.close();
    process.env.NODE_ENV = prevEnv;
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('answers 400 on malformed percent-encoding instead of crashing', async () => {
    const res = await req(port, '/assets/%zz');
    expect(res.status).toBe(400);
  });

  it('still serves a normal SSR route after a malformed request', async () => {
    const res = await req(port, '/somepage');
    expect(res.status).toBe(200);
    expect(res.body).toContain('ok');
  });
});
