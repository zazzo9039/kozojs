/**
 * H3 / F-08, F-09, F-10 — rate-limit key derivation, store bound, Retry-After.
 *
 * F-08: the two limiters disagreed and both trusted a client-writable header.
 *   `rateLimit` keyed on raw `x-forwarded-for` with no connection fallback, so
 *   with no proxy headers every client collapsed onto the literal `'anonymous'`
 *   (one client could exhaust the limit for everyone); `rateLimitGuard` keyed on
 *   `split(',')[0]` — the value the client wrote. Rotating the header reset the
 *   counter on either path.
 * F-09: the in-memory store had no size cap; a rotating identity grew it without
 *   bound between 60s sweeps.
 * F-10: 429 responses carried no `Retry-After`.
 *
 * The unit tests below pin the shared `resolveClientIp`; the integration tests
 * prove the behavior through the real `rateLimit` / `rateLimitGuard` entry
 * points. No secret is involved anywhere here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { resolveClientIp, type ClientAddressSource } from '../src/client-ip.js';
import { guardToHonoMiddleware } from '../src/guard.js';
import {
  rateLimit,
  rateLimitGuard,
  clearRateLimitStore,
  _memoryStoreSize,
  _setMaxMemoryKeysForTest,
} from '../src/middleware/rate-limit.js';
import type { GuardRequest } from '../src/guard.js';

async function startNodeServer(app: Hono): Promise<{
  server: ReturnType<typeof serve>;
  port: number;
}> {
  const server = serve({ fetch: app.fetch, port: 0 });
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP port');
  return { server, port: address.port };
}

function nodeRequest(
  port: number,
  options: { localAddress?: string; headers?: Record<string, string> } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/',
      localAddress: options.localAddress,
      headers: options.headers,
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

async function closeNodeServer(server: ReturnType<typeof serve>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A source builder: a fixed connection address + a header bag.
// ─────────────────────────────────────────────────────────────────────────────

function source(connectionAddress: string, headers: Record<string, string> = {}): ClientAddressSource {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    connectionAddress,
    header: (name) => lower[name.toLowerCase()],
  };
}

describe('resolveClientIp — trustProxy: false (default)', () => {
  it('keys on the connection address and ignores x-forwarded-for entirely', () => {
    expect(resolveClientIp(source('9.9.9.9', { 'x-forwarded-for': '1.2.3.4' }), false)).toBe('9.9.9.9');
  });

  it('a rotating x-forwarded-for does not change the key', () => {
    const conn = '9.9.9.9';
    const k1 = resolveClientIp(source(conn, { 'x-forwarded-for': '1.1.1.1' }), false);
    const k2 = resolveClientIp(source(conn, { 'x-forwarded-for': '2.2.2.2' }), false);
    const k3 = resolveClientIp(source(conn, { 'x-forwarded-for': '3.3.3.3, 4.4.4.4' }), false);
    expect(new Set([k1, k2, k3])).toEqual(new Set(['9.9.9.9']));
  });

  it('two distinct connections get two distinct keys (no collapse onto "anonymous")', () => {
    expect(resolveClientIp(source('10.0.0.1'), false)).not.toBe(resolveClientIp(source('10.0.0.2'), false));
  });

  it('falls back to "anonymous" only when there is genuinely no connection address', () => {
    expect(resolveClientIp(source('', { 'x-forwarded-for': '1.2.3.4' }), false)).toBe('anonymous');
  });

  it('ignores x-real-ip when not trusting a proxy', () => {
    expect(resolveClientIp(source('9.9.9.9', { 'x-real-ip': '1.2.3.4' }), false)).toBe('9.9.9.9');
  });
});

describe('resolveClientIp — trustProxy trusts hops from the RIGHT', () => {
  it('trustProxy: true takes the single proxy-appended hop', () => {
    expect(resolveClientIp(source('proxy', { 'x-forwarded-for': 'client-ip' }), true)).toBe('client-ip');
  });

  it('a client that prepends a spoofed hop cannot change the resolved IP', () => {
    // XFF the app sees: "spoofed, real-client, proxy1" behind 2 proxies.
    const s = source('inner-proxy', { 'x-forwarded-for': 'spoofed, real-client, proxy1' });
    expect(resolveClientIp(s, 2)).toBe('real-client');
  });

  it('trustProxy: 2 with a well-formed 2-hop header takes the leftmost real hop', () => {
    expect(resolveClientIp(source('p2', { 'x-forwarded-for': 'client, p1' }), 2)).toBe('client');
  });

  it('falls back to the connection when the header is shorter than the trusted depth', () => {
    // Claimed 2 proxies but only 1 hop present → header is untrustworthy here.
    expect(resolveClientIp(source('conn', { 'x-forwarded-for': 'only-one' }), 2)).toBe('conn');
  });

  it('honors x-real-ip only as a last resort under a trusted proxy', () => {
    expect(resolveClientIp(source('conn', { 'x-real-ip': '5.6.7.8' }), true)).toBe('5.6.7.8');
  });

  it('trustProxy: 0 and negative behave as false', () => {
    expect(resolveClientIp(source('conn', { 'x-forwarded-for': 'client' }), 0)).toBe('conn');
    expect(resolveClientIp(source('conn', { 'x-forwarded-for': 'client' }), -1 as unknown as number)).toBe('conn');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration through the real middleware. Hono's synthetic Request has no
// socket, so the connection address is '' and every request keys on
// 'anonymous' — which is exactly why a rotating XFF must NOT reset the counter
// under the default. (Under a real listen() transport the socket is present and
// distinct clients get distinct keys — proven by the unit tests above.)
// ─────────────────────────────────────────────────────────────────────────────

describe('rateLimit middleware — F-08 header-rotation bypass is closed', () => {
  beforeEach(() => clearRateLimitStore());

  it('a rotating x-forwarded-for does not reset the counter (default trustProxy)', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ max: 2, window: 60 }));
    app.get('/t', (c) => c.text('ok'));

    const hit = (xff: string) => app.fetch(new Request('http://localhost/t', { headers: { 'x-forwarded-for': xff } }));
    expect((await hit('1.1.1.1')).status).toBe(200);
    expect((await hit('2.2.2.2')).status).toBe(200);
    const third = await hit('3.3.3.3'); // would be 200 if the header still keyed the bucket
    expect(third.status).toBe(429);
  });

  it('429 carries a Retry-After header (F-10)', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ max: 1, window: 60 }));
    app.get('/t', (c) => c.text('ok'));

    await app.fetch(new Request('http://localhost/t'));
    const blocked = await app.fetch(new Request('http://localhost/t'));
    expect(blocked.status).toBe(429);
    const retry = Number(blocked.headers.get('Retry-After'));
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(60);
  });

  it('under trustProxy, distinct client hops get distinct buckets', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ max: 1, window: 60, trustProxy: true }));
    app.get('/t', (c) => c.text('ok'));

    const hit = (xff: string) => app.fetch(new Request('http://localhost/t', { headers: { 'x-forwarded-for': xff } }));
    expect((await hit('client-a')).status).toBe(200); // a: 1st
    expect((await hit('client-b')).status).toBe(200); // b: 1st, separate bucket
    expect((await hit('client-a')).status).toBe(429); // a: 2nd → over max 1
  });
});

describe('real @hono/node-server connection identity', () => {
  beforeEach(() => clearRateLimitStore());
  afterEach(() => clearRateLimitStore());

  it('keeps distinct direct connections in distinct middleware buckets', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ max: 1, window: 60 }));
    app.get('/', (c) => c.text('ok'));
    const { server, port } = await startNodeServer(app);

    try {
      expect(await nodeRequest(port, { localAddress: '127.0.0.1' })).toBe(200);
      expect(await nodeRequest(port, { localAddress: '127.0.0.2' })).toBe(200);
    } finally {
      await closeNodeServer(server);
    }
  });

  it('does not let rotating X-Forwarded-For bypass rateLimitGuard by default', async () => {
    const app = new Hono();
    app.use('*', guardToHonoMiddleware(rateLimitGuard({ max: 1, window: 60 })));
    app.get('/', (c) => c.text('ok'));
    const { server, port } = await startNodeServer(app);

    try {
      expect(await nodeRequest(port, { headers: { 'x-forwarded-for': '1.1.1.1' } })).toBe(200);
      expect(await nodeRequest(port, { headers: { 'x-forwarded-for': '2.2.2.2' } })).toBe(429);
      expect(await nodeRequest(port, { headers: { 'x-forwarded-for': '3.3.3.3' } })).toBe(429);
    } finally {
      await closeNodeServer(server);
    }
  });
});

describe('default in-memory stores are isolated per limiter', () => {
  beforeEach(() => clearRateLimitStore());
  afterEach(() => clearRateLimitStore());

  it('traffic counted by one policy cannot exhaust another policy', async () => {
    const app = new Hono();
    app.use('/a', rateLimit({ max: 10, window: 60, keyGenerator: () => 'same-client' }));
    app.use('/b', rateLimit({ max: 1, window: 60, keyGenerator: () => 'same-client' }));
    app.get('/a', (c) => c.text('a'));
    app.get('/b', (c) => c.text('b'));

    expect((await app.request('/a')).status).toBe(200);
    expect((await app.request('/b')).status).toBe(200);
    expect((await app.request('/b')).status).toBe(429);
  });

  it('keeps the memory cap global across isolated limiter namespaces', async () => {
    const previousCap = _setMaxMemoryKeysForTest(5);
    const a = rateLimitGuard({ max: 100, window: 60 });
    const b = rateLimitGuard({ max: 100, window: 60 });
    const req = (ip: string): GuardRequest => ({
      method: 'GET',
      path: '/',
      url: '/',
      remoteAddress: ip,
      params: {},
      user: null,
      header: () => undefined,
    });

    try {
      for (let i = 0; i < 4; i++) await a(req(`10.0.0.${i}`));
      for (let i = 0; i < 4; i++) await b(req(`10.0.1.${i}`));
      expect(_memoryStoreSize()).toBe(5);
    } finally {
      _setMaxMemoryKeysForTest(previousCap);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parity: the same client is bucketed identically on both transports.
// ─────────────────────────────────────────────────────────────────────────────

describe('rateLimit / rateLimitGuard key parity', () => {
  it('the shared resolver yields the same key for equivalent middleware and guard sources', () => {
    const conn = '203.0.113.7';
    const honoLike = source(conn, { 'x-forwarded-for': 'spoof' });
    const guardLike = source(conn, { 'x-forwarded-for': 'spoof' });
    expect(resolveClientIp(honoLike, false)).toBe(resolveClientIp(guardLike, false));
    expect(resolveClientIp(honoLike, false)).toBe(conn);
  });

  it('rateLimitGuard keys on remoteAddress and emits Retry-After on 429', async () => {
    clearRateLimitStore();
    const guard = rateLimitGuard({ max: 1, window: 60 });
    const req = (): GuardRequest => ({
      method: 'GET',
      path: '/x',
      url: '/x',
      remoteAddress: '198.51.100.5',
      params: {},
      user: null,
      header: () => undefined,
    });
    const first = await guard(req());
    expect((first as any)?.deny).toBeUndefined();
    const second = await guard(req());
    expect((second as any)?.deny?.status).toBe(429);
    expect(Number((second as any)?.deny?.headers?.['Retry-After'])).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-09: the in-memory store is bounded. Cap lowered via the test seam so the
// assertion does not depend on inserting 100k keys.
// ─────────────────────────────────────────────────────────────────────────────

describe('in-memory store is bounded (F-09)', () => {
  let restore = 0;
  beforeEach(() => { clearRateLimitStore(); restore = _setMaxMemoryKeysForTest(5); });
  afterEach(() => { _setMaxMemoryKeysForTest(restore); clearRateLimitStore(); });

  it('never exceeds the cap and evicts the oldest inserted key first', async () => {
    const guard = rateLimitGuard({ max: 1000, window: 60 });
    const mkReq = (ip: string): GuardRequest => ({
      method: 'GET', path: '/x', url: '/x', remoteAddress: ip, params: {}, user: null, header: () => undefined,
    });

    // Insert 8 distinct identities against a cap of 5.
    for (let i = 1; i <= 8; i++) await guard(mkReq(`10.0.0.${i}`));

    expect(_memoryStoreSize()).toBe(5);

    // The 3 oldest (10.0.0.1..3) were evicted: hitting 10.0.0.1 again starts a
    // fresh window (count resets to 1), proving its prior record is gone.
    const reHit = await guard(mkReq('10.0.0.1'));
    expect((reHit as any)?.headers?.['X-RateLimit-Remaining']).toBe('999');
    expect(_memoryStoreSize()).toBe(5); // still capped after re-insert + evict
  });
});
