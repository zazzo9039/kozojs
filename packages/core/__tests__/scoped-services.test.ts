import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import http from 'node:http';
import { createKozo } from '../src/app.js';
import { tryLoadUws } from '../src/uws-transport.js';

async function httpGet(port: number, path: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('scopedServices (A3)', () => {
  it('merges scoped values over singletons in ctx.services', async () => {
    const app = createKozo({
      services: { counter: { n: 0 } },
      scopedServices: (_base, req) => ({
        reqId: req.header('x-request-id') ?? 'generated',
      }),
    });
    app.get('/id', (ctx) => ctx.json({
      reqId: (ctx.services as any).reqId,
      hasCounter: !!(ctx.services as any).counter,
    }));

    const res = await app.fetch(new Request('http://localhost/id', {
      headers: { 'x-request-id': 'abc-123' },
    }));
    expect(await res.json()).toEqual({ reqId: 'abc-123', hasCounter: true });
  });

  it('isolates scoped state across concurrent requests', async () => {
    const store = new Map<string, number>();
    const app = createKozo({
      services: { db: 'pool' },
      scopedServices: () => {
        const id = crypto.randomUUID();
        store.set(id, 0);
        return {
          tx: {
            id,
            bump: () => { store.set(id, (store.get(id) ?? 0) + 1); return store.get(id)!; },
          },
        };
      },
    });
    app.get('/bump', (ctx) => ctx.json({ count: (ctx.services as any).tx.bump() }));

    const [a, b] = await Promise.all([
      app.fetch(new Request('http://localhost/bump')),
      app.fetch(new Request('http://localhost/bump')),
    ]);
    expect(await a.json()).toEqual({ count: 1 });
    expect(await b.json()).toEqual({ count: 1 });
    expect(store.size).toBe(2);
  });

  it('creates fresh scoped objects per request', async () => {
    const seen: object[] = [];
    const app = createKozo({
      services: {},
      scopedServices: () => {
        const box = { v: 1 };
        seen.push(box);
        return { box };
      },
    });
    app.get('/x', () => ({}));

    await app.fetch(new Request('http://localhost/x'));
    await app.fetch(new Request('http://localhost/x'));
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('supports async scopedServices factory', async () => {
    const app = createKozo({
      services: { base: true },
      scopedServices: async (_base, req) => {
        await Promise.resolve();
        return { token: req.header('authorization') ?? 'none' };
      },
    });
    app.get('/t', (ctx) => ctx.json({ token: (ctx.services as any).token }));

    const res = await app.fetch(new Request('http://localhost/t', {
      headers: { authorization: 'Bearer xyz' },
    }));
    expect(await res.json()).toEqual({ token: 'Bearer xyz' });
  });

  it('calls onRequestEnd without error on success', async () => {
    const onEnd = vi.fn();
    const app = createKozo({
      services: {},
      scopedServices: () => ({ trace: 'ok' }),
      onRequestEnd: onEnd,
    });
    app.get('/ok', () => ({ ok: true }));
    await app.fetch(new Request('http://localhost/ok'));
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0]).toEqual({ trace: 'ok' });
    expect(onEnd.mock.calls[0][1]).toBeUndefined();
  });

  it('calls onRequestEnd with error when handler throws', async () => {
    const onEnd = vi.fn();
    const app = createKozo({
      services: {},
      scopedServices: () => ({ trace: 'fail' }),
      onRequestEnd: onEnd,
    });
    app.get('/boom', () => { throw new Error('boom'); });
    const res = await app.fetch(new Request('http://localhost/boom'));
    expect(res.status).toBe(500);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onEnd.mock.calls[0][0]).toEqual({ trace: 'fail' });
    expect(onEnd.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('still validates schema when scopedServices is enabled', async () => {
    const app = createKozo({
      services: {},
      scopedServices: () => ({ reqId: 'x' }),
    });
    app.post('/create', { body: z.object({ name: z.string() }) }, (ctx) => ctx.json(ctx.body));
    const bad = await app.fetch(new Request('http://localhost/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123 }),
    }));
    expect(bad.status).toBe(400);
  });

  it('singleton-only apps keep compile-time fast path (no scopedServices)', async () => {
    const singleton = { n: 1 };
    const app = createKozo({ services: { db: singleton } });
    app.get('/db', (ctx) => ctx.json({ same: ctx.services.db === singleton }));
    const res = await app.fetch(new Request('http://localhost/db'));
    expect(await res.json()).toEqual({ same: true });
  });
});

const uwsAvailable = (await tryLoadUws()) !== null;

describe.skipIf(!uwsAvailable)('native scopedServices via nativeListen', () => {
  it('merges scoped services on native path', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = createKozo({
      services: { pool: 'main' },
      scopedServices: (_base, req) => ({ rid: req.header('x-rid') ?? 'none' }),
    });
    app.get('/scoped', (ctx) => ({ rid: (ctx.services as any).rid, pool: (ctx.services as any).pool }));

    const { port, server } = await app.nativeListen({ port: 0 });
    try {
      const res = await httpGet(port, '/scoped', { 'x-rid': 'native-1' });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ rid: 'native-1', pool: 'main' });
    } finally {
      server.close();
      await app.shutdown({ timeoutMs: 3000 }).catch(() => {});
    }
  });
});

describe.skipIf(!uwsAvailable)('handler portability (A4)', () => {
  const portableHandler = (ctx: { json: (d: unknown) => unknown }) => ctx.json({ portable: true });

  it('same handler works via app.fetch (Hono)', async () => {
    const app = createKozo();
    app.get('/p', portableHandler as any);
    const res = await app.fetch(new Request('http://localhost/p'));
    expect(await res.json()).toEqual({ portable: true });
  });

  it('same handler works via nativeListen (return path)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = createKozo();
    app.get('/p', () => ({ portable: true }));

    const { port, server } = await app.nativeListen({ port: 0 });
    try {
      const res = await httpGet(port, '/p');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ portable: true });
    } finally {
      server.close();
      await app.shutdown({ timeoutMs: 3000 }).catch(() => {});
    }
  });

  it('native handler supports ctx.json() without return value', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = createKozo();
    app.get('/p', (ctx: any) => { ctx.json({ via: 'json' }); });

    const { port, server } = await app.nativeListen({ port: 0 });
    try {
      const res = await httpGet(port, '/p');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ via: 'json' });
    } finally {
      server.close();
      await app.shutdown({ timeoutMs: 3000 }).catch(() => {});
    }
  });
});
