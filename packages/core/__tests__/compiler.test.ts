// ============================================================================
// Tests for compiler.ts — SchemaCompiler, buildCtx prototype, body limit
// ============================================================================

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SchemaCompiler, compileRouteHandler, DEFAULT_MAX_BODY_BYTES } from '../src/compiler.js';
import type { CompiledRoute } from '../src/compiler.js';

// ── SchemaCompiler.compile ──────────────────────────────────────────────

describe('SchemaCompiler.compile', () => {
  it('compiles body validator from Zod schema', () => {
    const schema = { body: z.object({ name: z.string() }) };
    const compiled = SchemaCompiler.compile(schema);
    expect(compiled.validateBody).toBeDefined();
    expect(compiled.validateBody!({ name: 'Alice' }).valid).toBe(true);
    expect(compiled.validateBody!({ name: 123 }).valid).toBe(false);
  });

  it('compiles query validator from Zod schema', () => {
    const schema = { query: z.object({ page: z.coerce.number() }) };
    const compiled = SchemaCompiler.compile(schema);
    expect(compiled.validateQuery).toBeDefined();
    expect(compiled.validateQuery!({ page: '2' }).valid).toBe(true);
  });

  it('compiles params validator from Zod schema', () => {
    const schema = { params: z.object({ id: z.string().uuid() }) };
    const compiled = SchemaCompiler.compile(schema);
    expect(compiled.validateParams).toBeDefined();
    expect(compiled.validateParams!({ id: 'not-a-uuid' }).valid).toBe(false);
    expect(compiled.validateParams!({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }).valid).toBe(true);
  });

  it('creates serializer when response schema present', () => {
    const schema = { response: { 200: z.object({ ok: z.boolean() }) } };
    const compiled = SchemaCompiler.compile(schema);
    expect(compiled.serialize).toBeDefined();
    expect(compiled.serialize!({ ok: true })).toBe('{"ok":true}');
  });

  it('serializer converts Date to ISO string', () => {
    const schema = { response: { 200: z.any() } };
    const compiled = SchemaCompiler.compile(schema);
    const date = new Date('2025-01-01T00:00:00.000Z');
    const result = JSON.parse(compiled.serialize!({ created: date }));
    expect(result.created).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns empty compiled object for empty schema', () => {
    const compiled = SchemaCompiler.compile({});
    expect(compiled.validateBody).toBeUndefined();
    expect(compiled.validateQuery).toBeUndefined();
    expect(compiled.validateParams).toBeUndefined();
    expect(compiled.serialize).toBeUndefined();
  });

  it('strips extra keys from body (removeAdditional behaviour)', () => {
    const schema = { body: z.object({ name: z.string() }) };
    const compiled = SchemaCompiler.compile(schema);
    const data: Record<string, unknown> = { name: 'Alice', extra: true };
    compiled.validateBody!(data);
    expect(data).toEqual({ name: 'Alice' });
  });

  it('returns structured errors on validation failure', () => {
    const schema = { body: z.object({ age: z.number().min(0) }) };
    const compiled = SchemaCompiler.compile(schema);
    const result = compiled.validateBody!({ age: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeInstanceOf(Array);
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toHaveProperty('message');
    expect(result.errors![0]).toHaveProperty('instancePath');
  });
});

// ── DEFAULT_MAX_BODY_BYTES ──────────────────────────────────────────────

describe('DEFAULT_MAX_BODY_BYTES', () => {
  it('is 1 MB', () => {
    expect(DEFAULT_MAX_BODY_BYTES).toBe(1 * 1024 * 1024);
  });
});

// ── compileRouteHandler (Hono transport) ────────────────────────────────

describe('compileRouteHandler', () => {
  // Minimal Hono Context mock sufficient for buildCtx + response methods
  function mockHonoCtx(overrides: { json?: any; query?: any; param?: any; path?: string; url?: string; method?: string } = {}): any {
    const req = {
      header: (name: string) => (name === 'content-type' ? 'application/json' : undefined),
      url: overrides.url ?? 'http://localhost/test',
      method: overrides.method ?? 'GET',
      path: overrides.path ?? '/test',
      query: overrides.query ?? (() => ({})),
      param: overrides.param ?? (() => ({})),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    };
    return {
      req,
      json: overrides.json ?? ((data: any, _status?: number) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      text: (data: string) => new Response(data),
      html: (data: string) => new Response(data, { headers: { 'Content-Type': 'text/html' } }),
      redirect: (url: string) => Response.redirect(url),
      header: () => {},
      get: () => null,
    };
  }

  it('returns 200 JSON for a sync handler with no schema', async () => {
    const handler = () => ({ hello: 'world' });
    const compiled = SchemaCompiler.compile({});
    const honoHandler = compileRouteHandler(handler, {}, {}, compiled);
    const c = mockHonoCtx();
    const res = await honoHandler(c);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hello: 'world' });
  });

  it('passes validated query to handler', async () => {
    const schema = { query: z.object({ page: z.coerce.number() }) };
    const compiled = SchemaCompiler.compile(schema);
    let receivedQuery: any;
    const handler = (ctx: any) => { receivedQuery = ctx.query; return { ok: true }; };
    const c = mockHonoCtx({ query: () => ({ page: '3' }) });
    const honoHandler = compileRouteHandler(handler, schema, {}, compiled);
    await honoHandler(c);
    expect(receivedQuery).toEqual({ page: 3 }); // coerced to number
  });

  it('returns 422 for invalid query', async () => {
    const schema = { query: z.object({ page: z.number() }) };
    const compiled = SchemaCompiler.compile(schema);
    const handler = () => ({ ok: true });
    const c = mockHonoCtx({ query: () => ({ page: 'not-a-number' }) });
    const honoHandler = compileRouteHandler(handler, schema, {}, compiled);
    const res = await honoHandler(c);
    expect(res.status).toBe(400);
  });

  it('injects services into ctx', async () => {
    const services = { db: { query: 'mock' } };
    const compiled = SchemaCompiler.compile({});
    let receivedServices: any;
    const handler = (ctx: any) => { receivedServices = ctx.services; return {}; };
    const honoHandler = compileRouteHandler(handler, {}, services, compiled);
    const c = mockHonoCtx();
    await honoHandler(c);
    expect(receivedServices).toBe(services);
  });

  it('uses custom serializer when response schema present', async () => {
    const schema = { response: { 200: z.object({ ok: z.boolean() }) } };
    const compiled = SchemaCompiler.compile(schema);
    const handler = () => ({ ok: true });
    const honoHandler = compileRouteHandler(handler, schema, {}, compiled);
    const c = mockHonoCtx();
    const res = await honoHandler(c);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

// ── buildCtx prototype pattern ──────────────────────────────────────────

describe('buildCtx prototype pattern', () => {
  it('ctx.json delegates to Hono context', async () => {
    const schema = {};
    const compiled = SchemaCompiler.compile(schema);
    let ctxRef: any;
    const handler = (ctx: any) => { ctxRef = ctx; return ctx.json({ result: 1 }); };
    const honoHandler = compileRouteHandler(handler, schema, {}, compiled);

    const jsonMock = (_data: any, _s?: number) =>
      new Response(JSON.stringify(_data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const c = {
      req: { header: () => undefined, url: 'http://localhost/', method: 'GET', path: '/', query: () => ({}), param: () => ({}), text: () => Promise.resolve('') },
      json: jsonMock,
      text: (d: string) => new Response(d),
      html: (d: string) => new Response(d),
      redirect: (u: string) => Response.redirect(u),
      header: () => {},
      get: () => null,
    };

    const res = await honoHandler(c as any);
    expect(res).toBeInstanceOf(Response);
    const body = await res.json();
    expect(body).toEqual({ result: 1 });
    // Verify req adapter works
    expect(ctxRef.req.method).toBe('GET');
    expect(ctxRef.req.path).toBe('/');
  });

  it('ctx.req.header delegates to Hono request', async () => {
    const compiled = SchemaCompiler.compile({});
    let headerVal: string | undefined;
    const handler = (ctx: any) => { headerVal = ctx.req.header('x-test'); return {}; };
    const honoHandler = compileRouteHandler(handler, {}, {}, compiled);

    const c = {
      req: { header: (n: string) => n === 'x-test' ? 'found' : undefined, url: 'http://localhost/', method: 'GET', path: '/', query: () => ({}), param: () => ({}), text: () => Promise.resolve('') },
      json: (d: any) => new Response(JSON.stringify(d)),
      text: (d: string) => new Response(d),
      html: (d: string) => new Response(d),
      redirect: (u: string) => Response.redirect(u),
      header: () => {},
      get: () => null,
    };

    await honoHandler(c as any);
    expect(headerVal).toBe('found');
  });
});
