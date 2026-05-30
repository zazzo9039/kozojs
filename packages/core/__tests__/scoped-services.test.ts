import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createKozo } from '../src/app.js';
import { SchemaCompiler, compileNativeHandler } from '../src/compiler.js';
import type { ScopeConfig } from '../src/scoped-services.js';
import { createServer, request as httpRequest } from 'node:http';

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

describe('native scopedServices via compileNativeHandler', () => {
  it('merges scoped services on native path', async () => {
    const scope: ScopeConfig = {
      base: { pool: 'main' },
      factory: (_base, req) => ({ rid: req.header('x-rid') ?? 'none' }),
    };
    const compiled = SchemaCompiler.compile({});
    const handler = compileNativeHandler(
      (ctx: any) => ({ rid: ctx.services.rid, pool: ctx.services.pool }),
      {},
      scope.base,
      compiled,
      scope,
    );

    const port = await new Promise<number>((resolve) => {
      const srv = createServer((req, res) => handler(req, res, {}));
      srv.listen(0, () => resolve((srv.address() as any).port));
      setTimeout(() => srv.close(), 5000);
    });

    const body = await new Promise<string>((resolve, reject) => {
      const req = httpRequest({
        hostname: '127.0.0.1', port, path: '/', method: 'GET',
        headers: { 'x-rid': 'native-1' },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      });
      req.on('error', reject);
      req.end();
    });

    expect(JSON.parse(body)).toEqual({ rid: 'native-1', pool: 'main' });
  });
});

describe('handler portability (A4)', () => {
  const portableHandler = (ctx: { json: (d: unknown) => unknown }) => ctx.json({ portable: true });

  it('same handler works via app.fetch (Hono)', async () => {
    const app = createKozo();
    app.get('/p', portableHandler as any);
    const res = await app.fetch(new Request('http://localhost/p'));
    expect(await res.json()).toEqual({ portable: true });
  });

  it('same handler works via compileNativeHandler (return path)', async () => {
    const returnHandler = () => ({ portable: true });
    const compiled = SchemaCompiler.compile({});
    const handler = compileNativeHandler(returnHandler, {}, {}, compiled);

    const { port, close } = await new Promise<{ port: number; close: () => void }>((resolve) => {
      const srv = createServer((req, res) => handler(req, res, {}));
      srv.listen(0, () => resolve({
        port: (srv.address() as any).port,
        close: () => srv.close(),
      }));
    });

    const body = await new Promise<string>((resolve, reject) => {
      httpRequest({ hostname: '127.0.0.1', port, path: '/', method: 'GET' }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      }).on('error', reject).end();
    });

    expect(JSON.parse(body)).toEqual({ portable: true });
    close();
  });

  it('native handler supports ctx.json() without return value', async () => {
    const compiled = SchemaCompiler.compile({});
    const handler = compileNativeHandler(
      (ctx: any) => { ctx.json({ via: 'json' }); },
      {},
      {},
      compiled,
    );

    const { port, close } = await new Promise<{ port: number; close: () => void }>((resolve) => {
      const srv = createServer((req, res) => handler(req, res, {}));
      srv.listen(0, () => resolve({
        port: (srv.address() as any).port,
        close: () => srv.close(),
      }));
    });

    const body = await new Promise<string>((resolve, reject) => {
      httpRequest({ hostname: '127.0.0.1', port, path: '/', method: 'GET' }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      }).on('error', reject).end();
    });

    expect(JSON.parse(body)).toEqual({ via: 'json' });
    close();
  });
});
