// ============================================================================
// H5 / F-12, F-13 — static serving hardening: dotfile deny + symlink containment
// ============================================================================
//
// serveStaticFile() serves assets from dist/client on the production SSR server.
// Two gaps, both closed here:
//   F-12  a `.env` / `.git/config` / `.npmrc` inside the static root was served
//         verbatim (no dotfile deny).
//   F-13  a symlink inside the static root pointing outside it was followed —
//         `dist/client/data -> /etc` was a filesystem read primitive.
//
// The lexical traversal guard is deliberately left as-is (it is adequate:
// path.normalize clamps `..`, path.join re-anchors); this suite proves that too.
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
    // Send the raw path without re-encoding, so traversal payloads reach the server intact.
    const r = http.request({ host: '127.0.0.1', port, path: p, method: 'GET' }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    r.on('error', reject);
    r.setTimeout(3000, () => r.destroy(new Error('request timed out — server likely crashed')));
    r.end();
  });
}

/** Whether this OS/user can create symlinks (Windows often cannot without privilege). */
function detectSymlinkSupport(): boolean {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kozo-symcheck-'));
  try {
    fs.writeFileSync(path.join(d, 'target'), 'x');
    fs.symlinkSync(path.join(d, 'target'), path.join(d, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}

const SECRET = 'SUPERSECRET_MUST_NOT_LEAK';
const symlinkOK = detectSymlinkSupport();

describe('SSR static hardening (F-12 dotfiles, F-13 symlinks)', () => {
  let root: string;
  let outsideSecret: string;
  let server: Server;
  let port: number;
  let prevEnv: string | undefined;

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'kozo-ssr-harden-'));
    const client = path.join(root, 'dist/client');
    fs.mkdirSync(client, { recursive: true });
    fs.mkdirSync(path.join(root, 'dist/server'), { recursive: true });
    fs.writeFileSync(path.join(client, 'index.html'), '<html><body><!--app-html--></body></html>');
    fs.writeFileSync(
      path.join(root, 'dist/server/entry-server.js'),
      'export function render(){ return { html: "<div>ok</div>" }; }',
    );

    // A legitimate asset (control).
    fs.writeFileSync(path.join(client, 'app.js'), 'console.log("public asset")');
    // Dotfiles that must never be served.
    fs.writeFileSync(path.join(client, '.env'), `JWT_SECRET=${SECRET}`);
    fs.mkdirSync(path.join(client, '.git'), { recursive: true });
    fs.writeFileSync(path.join(client, '.git/config'), `password=${SECRET}`);

    // A secret OUTSIDE the static root, plus symlinks into/out of the root.
    outsideSecret = path.join(root, 'outside-secret.txt');
    fs.writeFileSync(outsideSecret, `OUTSIDE=${SECRET}`);
    if (symlinkOK) {
      fs.symlinkSync(outsideSecret, path.join(client, 'escape.txt')); // points OUT of root
      fs.mkdirSync(path.join(client, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(client, 'sub/real.txt'), 'inside-ok');
      fs.symlinkSync(path.join(client, 'sub/real.txt'), path.join(client, 'alias.txt')); // stays IN root
    }

    const honoHandler = async (_r: http.IncomingMessage, res: http.ServerResponse) => {
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

  it('serves a legitimate asset (control)', async () => {
    const res = await req(port, '/app.js');
    expect(res.status).toBe(200);
    expect(res.body).toContain('public asset');
  });

  it('does not serve a .env inside the static root (F-12)', async () => {
    const res = await req(port, '/.env');
    expect(res.body).not.toContain(SECRET);
  });

  it('does not serve a .git/config inside the static root (F-12)', async () => {
    const res = await req(port, '/.git/config');
    expect(res.body).not.toContain(SECRET);
  });

  it.skipIf(!symlinkOK)('does not follow a symlink pointing out of the root (F-13)', async () => {
    const res = await req(port, '/escape.txt');
    expect(res.body).not.toContain(SECRET);
  });

  it.skipIf(!symlinkOK)('still follows a symlink that stays inside the root', async () => {
    const res = await req(port, '/alias.txt');
    expect(res.status).toBe(200);
    expect(res.body).toContain('inside-ok');
  });

  // The lexical traversal guard is left unchanged; prove it holds against a
  // corpus of encoded escapes. None may return the outside secret, and the
  // server must stay up (a follow-up request still works).
  const traversals = [
    '/../outside-secret.txt',
    '/..%2foutside-secret.txt',
    '/%2e%2e%2foutside-secret.txt',
    '/%2e%2e/outside-secret.txt',
    '/....//outside-secret.txt',
    '/..%5coutside-secret.txt',
    '/%2e%2e%2f%2e%2e%2foutside-secret.txt',
    '/sub/../../outside-secret.txt',
  ];
  for (const p of traversals) {
    it(`does not escape the root via ${p}`, async () => {
      const res = await req(port, p);
      expect(res.body).not.toContain(SECRET);
    });
  }

  it('stays up after the traversal corpus (no crash)', async () => {
    const res = await req(port, '/app.js');
    expect(res.status).toBe(200);
    expect(res.body).toContain('public asset');
  });

  it('still answers 400 on malformed percent-encoding (unchanged)', async () => {
    const res = await req(port, '/assets/%zz');
    expect(res.status).toBe(400);
  });
});
