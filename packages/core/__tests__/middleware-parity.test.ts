// ============================================================================
// Middleware parity — listen() (Hono) vs nativeListen() (uWS bridge)
// ============================================================================
//
// Regression suite for the uWS middleware bypass: routes covered by
// app.middleware() patterns must behave identically on both transports
// (auth 401, rate-limit 429, CORS headers, body flow). Routes NOT covered
// stay on the zero-shim native path and must still work.
//
// Skipped when uWebSockets.js is not installed.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import http from 'node:http';
import { createKozo } from '../src/app.js';
import { tryLoadUws, middlewarePatternOverlaps } from '../src/uws-transport.js';
import { rateLimit } from '../src/middleware/rate-limit.js';
import { cors } from '../src/middleware/cors.js';

// ── HTTP helpers (same conventions as transport-parity.test.ts) ─────────────

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function headerValue(headers: HttpResult['headers'], name: string): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function setCookieHeaders(headers: HttpResult['headers']): string[] {
  const v = headers['set-cookie'] ?? headers['Set-Cookie'];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
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

// ── App factory: middlewares + covered and uncovered routes ─────────────────

function createMwApp() {
  const app = createKozo();

  // Auth-style guard with a public-path bypass — mirrors @kozojs/auth
  app.middleware('/api/*', async (c, next) => {
    if (new URL(c.req.url).pathname === '/api/public') return next();
    if (c.req.header('authorization') !== 'Bearer ok') {
      return c.json({ title: 'Unauthorized', status: 401 }, 401);
    }
    await next();
  });

  // Response-header middleware (CORS-like behavior through the chain)
  app.middleware('/api/*', cors({ origin: ['http://allowed.test'] }));

  app.get('/api/secret', () => ({ secret: true }));
  app.get('/api/public', () => ({ public: true }));
  app.post('/api/data', { body: z.object({ v: z.number() }) }, (ctx) => ({ got: ctx.body.v }));

  // NOT covered by any middleware pattern → stays on the native path
  app.get('/open', () => ({ open: true }));

  return app;
}

type Boot = { port: number; close: () => Promise<void> };

async function bootHono(app = createMwApp()): Promise<Boot> {
  const port = await freePort();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await app.listen(port);
  return { port, close: () => app.shutdown({ timeoutMs: 3000 }).catch(() => {}) };
}

async function bootNative(app = createMwApp()): Promise<Boot> {
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

async function onBothTransports(
  run: (port: number) => Promise<void>,
): Promise<void> {
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

describe.skipIf(!uwsAvailable)('middleware parity: listen() vs nativeListen()', () => {
  it('rejects a protected route without a token on BOTH transports (the uWS bypass regression)', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, { path: '/api/secret' });
      expect(res.status).toBe(401);
    });
  });

  it('allows a protected route with the token on both transports', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, {
        path: '/api/secret',
        headers: { authorization: 'Bearer ok' },
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ secret: true });
    });
  });

  it('lets the middleware bypass public paths via next() on both transports', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, { path: '/api/public' });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ public: true });
    });
  });

  it('applies CORS middleware headers on both transports', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, {
        path: '/api/public',
        headers: { origin: 'http://allowed.test' },
      });
      expect(res.status).toBe(200);
      expect(headerValue(res.headers, 'access-control-allow-origin')).toBe('http://allowed.test');
    });
  });

  it('runs body validation through the bridge (valid and invalid POST)', async () => {
    await onBothTransports(async (port) => {
      const ok = await httpRequest(port, {
        method: 'POST',
        path: '/api/data',
        headers: { authorization: 'Bearer ok', 'content-type': 'application/json' },
        body: JSON.stringify({ v: 42 }),
      });
      expect(ok.status).toBe(200);
      expect(JSON.parse(ok.body)).toEqual({ got: 42 });

      const bad = await httpRequest(port, {
        method: 'POST',
        path: '/api/data',
        headers: { authorization: 'Bearer ok', 'content-type': 'application/json' },
        body: JSON.stringify({ v: 'not-a-number' }),
      });
      expect(bad.status).toBe(400);
    });
  });

  it('keeps uncovered routes working (native fast path) on both transports', async () => {
    await onBothTransports(async (port) => {
      const res = await httpRequest(port, { path: '/open' });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ open: true });
    });
  });

  it('enforces rate limits on both transports (sequential boots, shared header key)', async () => {
    const buildApp = () => {
      const app = createKozo();
      app.middleware('/limited', rateLimit({ max: 2, window: 60 }));
      app.get('/limited', () => ({ ok: true }));
      return app;
    };
    const headers = { 'x-forwarded-for': '10.0.0.99' };

    const hono = await bootHono(buildApp());
    let honoStatuses: number[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        honoStatuses.push((await httpRequest(hono.port, { path: '/limited', headers })).status);
      }
    } finally {
      await hono.close(); // shutdown clears the rate-limit store
    }

    const native = await bootNative(buildApp());
    let nativeStatuses: number[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        nativeStatuses.push((await httpRequest(native.port, { path: '/limited', headers })).status);
      }
    } finally {
      await native.close();
    }

    expect(honoStatuses).toEqual([200, 200, 429]);
    expect(nativeStatuses).toEqual(honoStatuses);
  });

  it('preserves multiple Set-Cookie headers on bridged routes (both transports)', async () => {
    const buildApp = () => {
      const app = createKozo();
      app.middleware('/api/*', async (_c, next) => next());
      app.get('/api/cookies', () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.append('Set-Cookie', 'a=1; Path=/');
        headers.append('Set-Cookie', 'b=2; Path=/');
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      });
      return app;
    };

    const expectCookies = (cookies: string[]) => {
      expect(cookies).toHaveLength(2);
      expect(cookies.some((c) => c.startsWith('a=1'))).toBe(true);
      expect(cookies.some((c) => c.startsWith('b=2'))).toBe(true);
    };

    const hono = await bootHono(buildApp());
    try {
      expectCookies(setCookieHeaders((await httpRequest(hono.port, { path: '/api/cookies' })).headers));
    } finally {
      await hono.close();
    }

    const native = await bootNative(buildApp());
    try {
      expectCookies(setCookieHeaders((await httpRequest(native.port, { path: '/api/cookies' })).headers));
    } finally {
      await native.close();
    }
  });
});

// ── Pattern matcher unit tests (pure function, no uWS needed) ────────────────

describe('middlewarePatternOverlaps', () => {
  it('global patterns match everything', () => {
    expect(middlewarePatternOverlaps('*', '/api/users')).toBe(true);
    expect(middlewarePatternOverlaps('/*', '/anything/here')).toBe(true);
  });

  it('prefix wildcards match nested routes', () => {
    expect(middlewarePatternOverlaps('/api/*', '/api/users')).toBe(true);
    expect(middlewarePatternOverlaps('/api/*', '/api/billing/customers/:id')).toBe(true);
    expect(middlewarePatternOverlaps('/api/*', '/open')).toBe(false);
  });

  it('exact patterns require same segment count', () => {
    expect(middlewarePatternOverlaps('/api/auth/login', '/api/auth/login')).toBe(true);
    expect(middlewarePatternOverlaps('/api/auth/login', '/api/auth/login/extra')).toBe(false);
    expect(middlewarePatternOverlaps('/api/auth', '/api/auth/login')).toBe(false);
  });

  it('params on either side match conservatively', () => {
    expect(middlewarePatternOverlaps('/api/users/:id', '/api/users/:userId')).toBe(true);
    expect(middlewarePatternOverlaps('/api/users/42', '/api/users/:id')).toBe(true);
    expect(middlewarePatternOverlaps('/api/:section/*', '/api/billing/refunds')).toBe(true);
    expect(middlewarePatternOverlaps('/api/users/:id', '/api/posts/:id')).toBe(false);
  });
});
