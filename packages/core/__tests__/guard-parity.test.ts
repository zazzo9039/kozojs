// ============================================================================
// Guard parity — app.guard() on listen() (Hono) vs nativeListen() (uWS native)
// ============================================================================
//
// Guards are the transport-agnostic answer to the middleware/bridge trade-off:
// same security semantics on both transports, but compiled into the zero-shim
// uWS fast path instead of bridging through Hono. This suite asserts identical
// behavior (status, user propagation, headers, chaining) on both transports.
//
// Skipped when uWebSockets.js is not installed.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import http from 'node:http';
import { createKozo } from '../src/app.js';
import { tryLoadUws } from '../src/uws-transport.js';
import { compileGuardPattern } from '../src/guard.js';
import { rateLimitGuard } from '../src/middleware/rate-limit.js';
import type { Kozo } from '../src/app.js';
import type { Services } from '../src/types.js';

// ── HTTP helpers ─────────────────────────────────────────────────────────────

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function headerValue(headers: HttpResult['headers'], name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(v) ? v[0] : v;
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

async function httpRequest(
  port: number,
  opts: { method?: string; path: string; body?: string; headers?: Record<string, string> },
): Promise<HttpResult> {
  const method = opts.method ?? 'GET';
  const headers = { ...opts.headers };
  if (opts.body !== undefined && headers['Content-Length'] === undefined) {
    headers['Content-Length'] = String(Buffer.byteLength(opts.body));
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path: opts.path, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers as HttpResult['headers'],
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.end(opts.body);
    else req.end();
  });
}

// ── App factory: guard chain (auth → role) + public bypass + async guard ────

function createGuardApp(): Kozo<Services> {
  const app = createKozo();

  // Auth-like guard: token → user; public path bypass; missing token → 401
  app.guard('/api/*', (req) => {
    if (req.path === '/api/public') return;
    const token = req.header('authorization');
    if (token === 'Bearer admin') return { user: { sub: 'a1', role: 'admin' } };
    if (token === 'Bearer user') return { user: { sub: 'u1', role: 'user' } };
    return { deny: { status: 401, body: { title: 'Unauthorized', status: 401 } } };
  });

  // Role guard: runs AFTER auth guard in the chain, reads req.user
  app.guard('/api/admin/*', (req) => {
    const u = req.user as { role?: string } | null;
    if (u?.role !== 'admin') return { deny: { status: 403 } };
  });

  // Async guard on a dedicated subtree (forces the promise path)
  app.guard('/api/slow', async (req) => {
    await new Promise((r) => setTimeout(r, 5));
    if (req.header('x-block') === '1') return { deny: { status: 403 } };
  });

  app.get('/api/me', (ctx: any) => ({ user: ctx.user }));
  app.get('/api/public', () => ({ public: true }));
  app.get('/api/admin/panel', () => ({ admin: true }));
  app.get('/api/slow', () => ({ slow: true }));
  app.get('/api/users/:id', { params: z.object({ id: z.string() }) }, (ctx: any) => ({ id: ctx.params.id }));
  app.get('/open', () => ({ open: true }));

  return app;
}

type Boot = { port: number; close: () => Promise<void> };

async function bootHono(app = createGuardApp()): Promise<Boot> {
  const port = await freePort();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await app.listen(port);
  return { port, close: () => app.shutdown({ timeoutMs: 3000 }).catch(() => {}) };
}

async function bootNative(app = createGuardApp()): Promise<Boot> {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // port 0 → core picks the ephemeral port (with bind-race retry)
  const res = await app.nativeListen({ port: 0 });
  return {
    port: res.port,
    close: async () => {
      res.server.close();
      await app.shutdown({ timeoutMs: 3000 }).catch(() => {});
    },
  };
}

async function onBothTransports(run: (port: number) => Promise<void>): Promise<void> {
  const hono = await bootHono();
  try {
    await run(hono.port);
  } finally {
    await hono.close();
  }
  const native = await bootNative();
  try {
    await run(native.port);
  } finally {
    await native.close();
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

const uwsAvailable = (await tryLoadUws()) !== null;

describe.skipIf(!uwsAvailable)('guard parity: listen() vs nativeListen()', () => {
  it('denies without token on both transports (401)', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, { path: '/api/me' });
      expect(res.status).toBe(401);
      expect(JSON.parse(res.body)).toEqual({ title: 'Unauthorized', status: 401 });
    });
  });

  it('attaches the user to ctx.user on both transports', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, {
        path: '/api/me',
        headers: { authorization: 'Bearer user' },
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ user: { sub: 'u1', role: 'user' } });
    });
  });

  it('bypasses public paths on both transports', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, { path: '/api/public' });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ public: true });
    });
  });

  it('chains guards: role guard reads user set by auth guard (403 vs 200)', async () => {
    await onBothTransports(async (port) => {
      const denied = await httpRequest(port, {
        path: '/api/admin/panel',
        headers: { authorization: 'Bearer user' },
      });
      expect(denied.status).toBe(403);

      const allowed = await httpRequest(port, {
        path: '/api/admin/panel',
        headers: { authorization: 'Bearer admin' },
      });
      expect(allowed.status).toBe(200);
      expect(JSON.parse(allowed.body)).toEqual({ admin: true });
    });
  });

  it('default deny body is { title, status } on both transports', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, {
        path: '/api/admin/panel',
        headers: { authorization: 'Bearer user' },
      });
      expect(JSON.parse(res.body)).toEqual({ title: 'Forbidden', status: 403 });
    });
  });

  it('supports async guards on both transports', async () => {
    await onBothTransports(async (port) => {
      const ok = await httpRequest(port, {
        path: '/api/slow',
        headers: { authorization: 'Bearer user' },
      });
      expect(ok.status).toBe(200);
      expect(JSON.parse(ok.body)).toEqual({ slow: true });

      const blocked = await httpRequest(port, {
        path: '/api/slow',
        headers: { authorization: 'Bearer user', 'x-block': '1' },
      });
      expect(blocked.status).toBe(403);
    });
  });

  it('guard pattern matches at request time, not just route association', async () => {
    await onBothTransports(async (port) => {
      // /api/users/:id is associated with the '/api/*' auth guard but NOT
      // with '/api/admin/*' — a user token must reach it.
      const res = await httpRequest(port, {
        path: '/api/users/42',
        headers: { authorization: 'Bearer user' },
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ id: '42' });
    });
  });

  it('does not touch routes outside any guard pattern', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, { path: '/open' });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ open: true });
    });
  });

  it('rateLimitGuard enforces 429 and emits X-RateLimit headers on both transports', async () => {
    const buildApp = () => {
      const app = createKozo();
      app.guard('/limited', rateLimitGuard({ max: 2, window: 60 }));
      app.get('/limited', () => ({ ok: true }));
      return app;
    };
    const headers = { 'x-forwarded-for': '10.9.9.9' };

    const runSequence = async (port: number) => {
      const results: HttpResult[] = [];
      for (let i = 0; i < 3; i++) {
        results.push(await httpRequest(port, { path: '/limited', headers }));
      }
      return results;
    };

    const hono = await bootHono(buildApp());
    let honoResults: HttpResult[];
    try {
      honoResults = await runSequence(hono.port);
    } finally {
      await hono.close(); // shutdown clears the rate-limit store
    }

    const native = await bootNative(buildApp());
    let nativeResults: HttpResult[];
    try {
      nativeResults = await runSequence(native.port);
    } finally {
      await native.close();
    }

    for (const results of [honoResults, nativeResults]) {
      expect(results.map((r) => r.status)).toEqual([200, 200, 429]);
      expect(headerValue(results[0].headers, 'x-ratelimit-remaining')).toBe('1');
      expect(headerValue(results[2].headers, 'x-ratelimit-remaining')).toBe('0');
    }
  });

  it('rateLimitGuard keys by remoteAddress when proxy headers are absent (native)', async () => {
    const buildApp = () => {
      const app = createKozo();
      app.guard('/limited-ip', rateLimitGuard({ max: 2, window: 60 }));
      app.get('/limited-ip', () => ({ ok: true }));
      return app;
    };

    const native = await bootNative(buildApp());
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await httpRequest(native.port, { path: '/limited-ip' })).status);
      }
      expect(statuses).toEqual([200, 200, 429]);
    } finally {
      await native.close();
    }
  });

  it('guard exposes remoteAddress on the uWS native path', async () => {
    let seen = '';
    const app = createKozo();
    app.guard('/ip', (req) => { seen = req.remoteAddress; });
    app.get('/ip', () => ({ ok: true }));

    const native = await bootNative(app);
    try {
      const res = await httpRequest(native.port, { path: '/ip' });
      expect(res.status).toBe(200);
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      await native.close();
    }
  });

  it('guard errors surface as 500 on both transports', async () => {
    const buildApp = () => {
      const app = createKozo();
      app.guard('/boom', () => {
        throw new Error('guard exploded');
      });
      app.get('/boom', () => ({ never: true }));
      return app;
    };

    const hono = await bootHono(buildApp());
    try {
      expect((await httpRequest(hono.port, { path: '/boom' })).status).toBe(500);
    } finally {
      await hono.close();
    }
    const native = await bootNative(buildApp());
    try {
      expect((await httpRequest(native.port, { path: '/boom' })).status).toBe(500);
    } finally {
      await native.close();
    }
  });
});

// ── Pattern compiler unit tests (pure function, no uWS needed) ───────────────

describe('compileGuardPattern', () => {
  it('global patterns match everything', () => {
    expect(compileGuardPattern('*').test('/anything')).toBe(true);
    expect(compileGuardPattern('/*').test('/a/b/c')).toBe(true);
  });

  it('prefix wildcards match the subtree and the prefix itself', () => {
    const re = compileGuardPattern('/api/*');
    expect(re.test('/api/users')).toBe(true);
    expect(re.test('/api/users/42/posts')).toBe(true);
    expect(re.test('/api')).toBe(true);
    expect(re.test('/open')).toBe(false);
    expect(re.test('/apix')).toBe(false);
  });

  it('exact patterns match only the exact path (trailing slash tolerated)', () => {
    const re = compileGuardPattern('/api/auth/login');
    expect(re.test('/api/auth/login')).toBe(true);
    expect(re.test('/api/auth/login/')).toBe(true);
    expect(re.test('/api/auth/login/extra')).toBe(false);
    expect(re.test('/api/auth')).toBe(false);
  });

  it(':params match exactly one segment', () => {
    const re = compileGuardPattern('/users/:id');
    expect(re.test('/users/42')).toBe(true);
    expect(re.test('/users')).toBe(false);
    expect(re.test('/users/42/posts')).toBe(false);
  });

  it('escapes regex metacharacters in literal segments', () => {
    const re = compileGuardPattern('/v1.0/data');
    expect(re.test('/v1.0/data')).toBe(true);
    expect(re.test('/v1x0/data')).toBe(false);
  });
});
