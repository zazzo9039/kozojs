// ============================================================================
// Tests for compiler.ts — compileNativeHandler + readNativeBody
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SchemaCompiler, DEFAULT_MAX_BODY_BYTES, compileNativeHandler } from '../src/compiler.js';

// compileNativeHandler is not publicly exported — test via app.ts integration
// Instead, we test the full stack: register route → listen on HTTP → send request

import { createKozo } from '../src/app.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(
  port: number,
  method: string,
  path: string,
  body?: string | null,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1', port, method, path,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode!,
          headers: res.headers as Record<string, string>,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── compileRouteHandler error paths (via Hono fetch) ────────────────────

describe('compileRouteHandler error paths', () => {
  it('catches KozoError thrown by handler', async () => {
    const { KozoError } = await import('../src/errors.js');
    const app = createKozo();
    app.get('/err', () => { throw new KozoError('Gone', 410, 'gone'); });
    const res = await app.fetch(new Request('http://localhost/err'));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.title).toBe('Gone');
  });

  it('catches generic errors from handler (500)', async () => {
    const app = createKozo();
    app.get('/crash', () => { throw new Error('boom'); });
    const res = await app.fetch(new Request('http://localhost/crash'));
    expect(res.status).toBe(500);
  });

  it('catches KozoError from async handler', async () => {
    const { NotFoundError } = await import('../src/errors.js');
    const app = createKozo();
    app.get('/async-err', async () => { throw new NotFoundError('User not found'); });
    const res = await app.fetch(new Request('http://localhost/async-err'));
    expect(res.status).toBe(404);
  });

  it('body validation error returns 400 with errors detail', async () => {
    const app = createKozo();
    app.post('/strict', { body: z.object({ name: z.string(), age: z.number() }) }, (ctx) => ctx.json(ctx.body));
    const res = await app.fetch(new Request('http://localhost/strict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123, age: 'text' }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('param validation error returns 400', async () => {
    const app = createKozo();
    app.get('/users/:id', { params: z.object({ id: z.string().uuid() }) }, (ctx) => ctx.json({ id: ctx.params.id }));
    const res = await app.fetch(new Request('http://localhost/users/not-uuid'));
    expect(res.status).toBe(400);
  });

  it('handles handler returning a Response directly', async () => {
    const app = createKozo();
    app.get('/custom', () => new Response('custom body', { status: 201 }));
    const res = await app.fetch(new Request('http://localhost/custom'));
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('custom body');
  });

  it('handles async handler returning a Response directly (body path)', async () => {
    const app = createKozo();
    app.post('/custom',
      { body: z.object({ x: z.number() }) },
      async () => new Response('created', { status: 201 }),
    );
    const res = await app.fetch(new Request('http://localhost/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 1 }),
    }));
    expect(res.status).toBe(201);
  });

  it('handles async handler returning a Response directly (sync path)', async () => {
    const app = createKozo();
    app.get('/done', async () => new Response('ok', { status: 200 }));
    const res = await app.fetch(new Request('http://localhost/done'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('handles zero-arg handlers (handler.length === 0)', async () => {
    const app = createKozo();
    app.get('/noargs', () => ({ constant: true }));
    const res = await app.fetch(new Request('http://localhost/noargs'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.constant).toBe(true);
  });

  it('handles invalid JSON body gracefully', async () => {
    const app = createKozo();
    app.post('/json', { body: z.object({ x: z.number() }) }, (ctx) => ctx.json(ctx.body));
    const res = await app.fetch(new Request('http://localhost/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    }));
    // Should return 400 (body validation fails on empty-body fallback)
    expect(res.status).toBe(400);
  });

  it('KozoError in async body handler returns correct status', async () => {
    const { ForbiddenError } = await import('../src/errors.js');
    const app = createKozo();
    app.post('/admin',
      { body: z.object({ action: z.string() }) },
      async () => { throw new ForbiddenError(); },
    );
    const res = await app.fetch(new Request('http://localhost/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-all' }),
    }));
    expect(res.status).toBe(403);
  });

  it('generic error in async body handler returns 500', async () => {
    const app = createKozo();
    app.post('/boom',
      { body: z.object({ x: z.number() }) },
      async () => { throw new Error('db error'); },
    );
    const res = await app.fetch(new Request('http://localhost/boom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 1 }),
    }));
    expect(res.status).toBe(500);
  });
});

// ── fetch() integration (no real HTTP server needed) ─────────────────────

describe('Kozo fetch integration (additional)', () => {
  it('serves GET with JSON serializer (response schema)', async () => {
    const app = createKozo();
    const date = new Date('2025-01-01T00:00:00.000Z');
    app.get('/data', { response: { 200: z.any() } }, () => ({ created: date }));
    const res = await app.fetch(new Request('http://localhost/data'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe('2025-01-01T00:00:00.000Z');
  });

  it('validates POST body and returns validated result', async () => {
    const app = createKozo();
    app.post('/create', { body: z.object({ name: z.string() }) }, (ctx) => ctx.json({ created: ctx.body.name }));

    // Valid request
    const good = await app.fetch(new Request('http://localhost/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    }));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ created: 'Alice' });

    // Invalid request
    const bad = await app.fetch(new Request('http://localhost/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123 }),
    }));
    expect(bad.status).toBe(400);
  });
});

// ── compileNativeHandler — direct Node.js HTTP tests ───────────────────
//
// Spins up a real Node.js HTTP server using createServer() so the full
// stream-based readNativeBody() path is exercised (no uWS dependency).

describe('compileNativeHandler', () => {
  /** Bind a compileNativeHandler result to a real HTTP server. */
  async function startServer(handler: ReturnType<typeof compileNativeHandler>, params = {}): Promise<{ port: number; close: () => void }> {
    return new Promise((resolve) => {
      const { createServer: httpCreateServer } = require('node:http');
      const srv = httpCreateServer((req: any, res: any) => handler(req, res, params));
      srv.listen(0, () => resolve({ port: (srv.address() as any).port, close: () => srv.close() }));
    });
  }

  it('sync handler with no schema returns 200 JSON', async () => {
    const compiled = SchemaCompiler.compile({});
    const handler = compileNativeHandler(() => ({ ok: true }), {}, {}, compiled);
    const { port, close } = await startServer(handler);

    const result = await makeRequest(port, 'GET', '/');
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
    close();
  });

  it('sync handler with params validation returns 400 on bad params', async () => {
    const schema = { params: z.object({ id: z.string().uuid() }) };
    const compiled = SchemaCompiler.compile(schema);
    const handler = compileNativeHandler((ctx: any) => ctx.params, schema, {}, compiled);
    // Pass an invalid param directly (non-UUID)
    const { port, close } = await startServer(handler, { id: 'not-a-uuid' });

    const result = await makeRequest(port, 'GET', '/');
    expect(result.status).toBe(400);
    close();
  });

  it('sync handler with params validation returns 200 on valid params', async () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    const schema = { params: z.object({ id: z.string().uuid() }) };
    const compiled = SchemaCompiler.compile(schema);
    const handler = compileNativeHandler((ctx: any) => ({ id: ctx.params.id }), schema, {}, compiled);
    const { port, close } = await startServer(handler, { id: validId });

    const result = await makeRequest(port, 'GET', '/');
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ id: validId });
    close();
  });

  it('async body handler returns 200 on valid body', async () => {
    const schema = { body: z.object({ name: z.string() }) };
    const compiled = SchemaCompiler.compile(schema);
    const handler = compileNativeHandler(
      async (ctx: any) => ({ echo: ctx.body.name }),
      schema,
      {},
      compiled,
    );
    const { port, close } = await startServer(handler);

    const result = await makeRequest(port, 'POST', '/', JSON.stringify({ name: 'Alice' }));
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ echo: 'Alice' });
    close();
  });

  it('async body handler returns 400 on invalid body', async () => {
    const schema = { body: z.object({ name: z.string() }) };
    const compiled = SchemaCompiler.compile(schema);
    const handler = compileNativeHandler(
      async (ctx: any) => ({ echo: ctx.body.name }),
      schema,
      {},
      compiled,
    );
    const { port, close } = await startServer(handler);

    const result = await makeRequest(port, 'POST', '/', JSON.stringify({ name: 123 }));
    expect(result.status).toBe(400);
    close();
  });

  it('async body handler returns 413 when body exceeds size limit', async () => {
    const schema = { body: z.object({ data: z.string() }) };
    const compiled = SchemaCompiler.compile(schema);
    const handler = compileNativeHandler(() => ({}), schema, {}, compiled);
    const { port, close } = await startServer(handler);

    // Build oversized body (1 MB + 1 byte)
    const oversized = Buffer.alloc(DEFAULT_MAX_BODY_BYTES + 1, 0x61).toString();
    const result = await makeRequest(port, 'POST', '/', oversized).catch(
      // ECONNRESET is acceptable — server destroys the connection on oversize
      (err: any) => err.code === 'ECONNRESET' ? { status: 413, body: '' } : Promise.reject(err),
    );
    expect(result.status).toBe(413);
    close();
  });

  it('sync async handler (returns promise) is handled correctly', async () => {
    const compiled = SchemaCompiler.compile({});
    const handler = compileNativeHandler(
      async () => ({ delayed: true }),
      {},
      {},
      compiled,
    );
    const { port, close } = await startServer(handler);

    const result = await makeRequest(port, 'GET', '/');
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ delayed: true });
    close();
  });
});
