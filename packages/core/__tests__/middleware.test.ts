// ============================================================================
// Tests for middleware — cors, logger, rate-limit, error-handler
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import { createKozo } from '../src/app.js';

// ── cors ─────────────────────────────────────────────────────────────────

describe('cors middleware', () => {
  it('sets Access-Control-Allow-Origin header', async () => {
    const { cors } = await import('../src/middleware/cors.js');
    const app = new Hono();
    app.use('*', cors({ origin: 'https://example.com' }));
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(new Request('http://localhost/test', {
      headers: { Origin: 'https://example.com' },
    }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });

  it('defaults to * origin', async () => {
    const { cors } = await import('../src/middleware/cors.js');
    const app = new Hono();
    app.use('*', cors());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(new Request('http://localhost/test', {
      headers: { Origin: 'https://anything.com' },
    }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('responds to OPTIONS preflight', async () => {
    const { cors } = await import('../src/middleware/cors.js');
    const app = new Hono();
    app.use('*', cors({ origin: '*' }));
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(new Request('http://localhost/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    }));
    expect(res.status).toBeLessThan(400);
  });
});

// ── logger ───────────────────────────────────────────────────────────────

describe('logger middleware', () => {
  it('logs method, path, status and duration', async () => {
    const { logger } = await import('../src/middleware/logger.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = new Hono();
    app.use('*', logger());
    app.get('/test', (c) => c.text('ok'));

    await app.fetch(new Request('http://localhost/test'));

    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain('GET');
    expect(msg).toContain('/test');
    expect(msg).toContain('200');
    expect(msg).toMatch(/\d+ms/);

    logSpy.mockRestore();
  });

  it('uses custom prefix', async () => {
    const { logger } = await import('../src/middleware/logger.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = new Hono();
    app.use('*', logger({ prefix: '[API]' }));
    app.get('/test', (c) => c.text('ok'));

    await app.fetch(new Request('http://localhost/test'));

    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain('[API]');

    logSpy.mockRestore();
  });
});

// ── sanitizeForLog ────────────────────────────────────────────────────────

describe('sanitizeForLog', () => {
  it('escapes newline characters so they cannot inject false log lines', async () => {
    const { sanitizeForLog } = await import('../src/middleware/logger.js');
    const result = sanitizeForLog('/api/users\nFAKE LOG ENTRY');
    expect(result).not.toContain('\n');
    expect(result).toContain('\\n');
    expect(result).toBe('/api/users\\nFAKE LOG ENTRY');
  });

  it('escapes ANSI escape sequences so they cannot inject terminal color codes', async () => {
    const { sanitizeForLog } = await import('../src/middleware/logger.js');
    const result = sanitizeForLog('/path\x1b[31mRED\x1b[0m');
    expect(result).not.toContain('\x1b');
    expect(result).toContain('\\x1b');
    expect(result).toBe('/path\\x1b[31mRED\\x1b[0m');
  });

  it('escapes carriage returns', async () => {
    const { sanitizeForLog } = await import('../src/middleware/logger.js');
    const result = sanitizeForLog('/path\r\ninjected');
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
  });

  it('leaves normal paths unchanged', async () => {
    const { sanitizeForLog } = await import('../src/middleware/logger.js');
    expect(sanitizeForLog('/api/v1/users/123')).toBe('/api/v1/users/123');
  });
});

// ── rate-limit ───────────────────────────────────────────────────────────

describe('rateLimit middleware', () => {
  beforeEach(async () => {
    const { clearRateLimitStore } = await import('../src/middleware/rate-limit.js');
    clearRateLimitStore();
  });

  it('allows requests under the limit', async () => {
    const { rateLimit } = await import('../src/middleware/rate-limit.js');
    const app = new Hono();
    app.use('*', rateLimit({ max: 5, window: 60 }));
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(new Request('http://localhost/test'));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('blocks requests over the limit with 429', async () => {
    const { rateLimit } = await import('../src/middleware/rate-limit.js');
    const app = new Hono();
    app.use('*', rateLimit({ max: 2, window: 60 }));
    app.get('/test', (c) => c.text('ok'));

    // Use same IP header for all requests
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    await app.fetch(new Request('http://localhost/test', { headers }));
    await app.fetch(new Request('http://localhost/test', { headers }));
    const res = await app.fetch(new Request('http://localhost/test', { headers }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Too many requests');
  });

  it('uses custom keyGenerator', async () => {
    const { rateLimit } = await import('../src/middleware/rate-limit.js');
    const app = new Hono();
    app.use('*', rateLimit({
      max: 1,
      window: 60,
      keyGenerator: (c) => c.req.header('x-api-key') ?? 'anon',
    }));
    app.get('/test', (c) => c.text('ok'));

    // Different keys should have separate limits
    const res1 = await app.fetch(new Request('http://localhost/test', { headers: { 'x-api-key': 'key-a' } }));
    const res2 = await app.fetch(new Request('http://localhost/test', { headers: { 'x-api-key': 'key-b' } }));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('uses custom rejection message', async () => {
    const { rateLimit } = await import('../src/middleware/rate-limit.js');
    const app = new Hono();
    app.use('*', rateLimit({ max: 0, window: 60, message: 'Slow down!' }));
    app.get('/test', (c) => c.text('ok'));

    const res = await app.fetch(new Request('http://localhost/test'));
    const body = await res.json();
    expect(body.error).toBe('Slow down!');
  });

  it('app.shutdown() clears rate-limit store so state resets', async () => {
    const { rateLimit, clearRateLimitStore } = await import('../src/middleware/rate-limit.js');
    clearRateLimitStore();

    // Build an app with rateLimit that populates the shared memoryMap
    const app1 = createKozo({ services: { env: 'test' } });
    app1.middleware(rateLimit({ max: 1, window: 60 }));
    app1.get('/probe', () => ({ ok: true }));

    // First request — count becomes 1, which equals max (still 200)
    const r1 = await app1.fetch(new Request('http://localhost/probe'));
    expect(r1.status).toBe(200);

    // Second request — count becomes 2 > max(1) — 429
    const r2 = await app1.fetch(new Request('http://localhost/probe'));
    expect(r2.status).toBe(429);

    // Shutdown should call clearRateLimitStore() clearing the global memoryMap
    await app1.shutdown();

    // New app with same limit — store was cleared so count starts at 0 again
    const app2 = createKozo({ services: { env: 'test' } });
    app2.middleware(rateLimit({ max: 1, window: 60 }));
    app2.get('/probe', () => ({ ok: true }));

    const r3 = await app2.fetch(new Request('http://localhost/probe'));
    expect(r3.status).toBe(200); // 200 proves store was cleared; otherwise would be 429

    await app2.shutdown();
  });
});

// ── error-handler ────────────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  it('catches KozoError and returns RFC 7807 response', async () => {
    const { errorHandler } = await import('../src/middleware/error-handler.js');
    const { KozoError } = await import('../src/errors.js');

    const app = new Hono();
    // Register error handler middleware + Hono's onError as fallback
    app.use('*', errorHandler());
    app.onError((err, c) => {
      if (err instanceof KozoError) return err.toResponse(c.req.path);
      return c.json({ error: 'Internal Server Error' }, 500);
    });
    app.get('/fail', () => { throw new KozoError('Not found', 404, 'not-found'); });

    const res = await app.fetch(new Request('http://localhost/fail'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe('Not found');
  });

  it('catches unknown errors with 500', async () => {
    const { errorHandler } = await import('../src/middleware/error-handler.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = new Hono();
    app.use('*', errorHandler());
    app.get('/fail', () => { throw new Error('unexpected'); });

    const res = await app.fetch(new Request('http://localhost/fail'));
    expect(res.status).toBe(500);
  });
});

// ── verifyWebhookSignature ────────────────────────────────────────────────

describe('verifyWebhookSignature middleware', () => {
  const SECRET = 'super-secret-key';
  const BODY = JSON.stringify({ event: 'push', repo: 'kozo' });

  function sign(body: string, secret = SECRET, algo = 'sha256'): string {
    return `${algo}=${createHmac(algo, secret).update(body).digest('hex')}`;
  }

  function makeApp() {
    const app = new Hono();
    return app;
  }

  it('passes through when signature is correct', async () => {
    const { verifyWebhookSignature } = await import('../src/middleware/webhook-verify.js');
    const app = makeApp();
    app.use('*', verifyWebhookSignature({ secret: SECRET }));
    app.post('/hook', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-signature': sign(BODY) },
        body: BODY,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 403 when signature is wrong', async () => {
    const { verifyWebhookSignature } = await import('../src/middleware/webhook-verify.js');
    const app = makeApp();
    app.use('*', verifyWebhookSignature({ secret: SECRET }));
    app.post('/hook', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'sha256=deadbeef' },
        body: BODY,
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.title).toBe('Forbidden');
  });

  it('returns 401 when signature header is missing', async () => {
    const { verifyWebhookSignature } = await import('../src/middleware/webhook-verify.js');
    const app = makeApp();
    app.use('*', verifyWebhookSignature({ secret: SECRET }));
    app.post('/hook', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: BODY,
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.title).toBe('Unauthorized');
  });

  it('works correctly with sha512 algorithm', async () => {
    const { verifyWebhookSignature } = await import('../src/middleware/webhook-verify.js');
    const app = makeApp();
    app.use('*', verifyWebhookSignature({ secret: SECRET, algorithm: 'sha512' }));
    app.post('/hook', (c) => c.json({ ok: true }));

    const sig512 = sign(BODY, SECRET, 'sha512');
    const res = await app.fetch(
      new Request('http://localhost/hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-signature': sig512 },
        body: BODY,
      }),
    );
    expect(res.status).toBe(200);
  });

  it('supports custom header name', async () => {
    const { verifyWebhookSignature } = await import('../src/middleware/webhook-verify.js');
    const app = makeApp();
    app.use('*', verifyWebhookSignature({ secret: SECRET, headerName: 'x-hub-signature-256' }));
    app.post('/hook', (c) => c.json({ ok: true }));

    const res = await app.fetch(
      new Request('http://localhost/hook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sign(BODY) },
        body: BODY,
      }),
    );
    expect(res.status).toBe(200);
  });
});

