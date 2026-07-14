// ============================================================================
// Tests for app.ts — Kozo registration, schema normalization, getRoutes
// ============================================================================

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createKozo } from '../src/app.js';
import { NotFoundError } from '../src/errors.js';

// ── Schema normalization ─────────────────────────────────────────────────

describe('Schema normalization', () => {
  it('normalizes bare Zod response into { 200: schema }', () => {
    const app = createKozo();
    const responseSchema = z.object({ ok: z.boolean() });
    app.get('/test', { response: responseSchema as any }, (ctx) => ctx.json({ ok: true }));

    const routes = app.getRoutes();
    expect(routes).toHaveLength(1);
    // After normalization, response should be { 200: schema } not the bare schema
    const resp = routes[0].schema.response as Record<number, unknown>;
    expect(resp).toBeDefined();
    expect(resp[200]).toBe(responseSchema);
  });

  it('leaves already-normalized response as-is', () => {
    const app = createKozo();
    const responseSchema = z.object({ ok: z.boolean() });
    const normalizedResponse = { 200: responseSchema };
    app.get('/test', { response: normalizedResponse }, (ctx) => ctx.json({ ok: true }));

    const routes = app.getRoutes();
    expect(routes[0].schema.response).toBe(normalizedResponse);
  });

  it('passes normalized schema to both Hono and deferred uWS', () => {
    const app = createKozo();
    const bodySchema = z.object({ name: z.string() });
    const responseSchema = z.object({ id: z.number() });
    app.post('/users', { body: bodySchema, response: responseSchema as any }, (ctx) => ctx.json({ id: 1 }));

    const routes = app.getRoutes();
    expect(routes).toHaveLength(1);
    const route = routes[0];
    // Body should be unchanged
    expect(route.schema.body).toBe(bodySchema);
    // Response should be normalized
    const resp = route.schema.response as Record<number, unknown>;
    expect(resp[200]).toBe(responseSchema);
  });
});

// ── Route registration ────────────────────────────────────────────────────

describe('Route registration', () => {
  it('registers routes for all HTTP methods', () => {
    const app = createKozo();
    app.get('/a', () => ({}));
    app.post('/b', () => ({}));
    app.put('/c', () => ({}));
    app.patch('/d', () => ({}));
    app.delete('/e', () => ({}));

    const routes = app.getRoutes();
    expect(routes).toHaveLength(5);
    expect(routes.map(r => r.method)).toEqual(['get', 'post', 'put', 'patch', 'delete']);
    expect(routes.map(r => r.path)).toEqual(['/a', '/b', '/c', '/d', '/e']);
  });

  it('registers schema-less handlers with empty schema', () => {
    const app = createKozo();
    app.get('/hello', () => ({ hello: 'world' }));

    const routes = app.getRoutes();
    expect(routes[0].schema).toEqual({});
  });
});

// ── Group routing ─────────────────────────────────────────────────────────

describe('Group routing', () => {
  it('prepends prefix to all grouped routes', () => {
    const app = createKozo();
    app.group('/api/v1', (r) => {
      r.get('/users', () => ({}));
      r.post('/users', () => ({}));
      r.get('/users/:id', () => ({}));
    });

    const routes = app.getRoutes();
    expect(routes).toHaveLength(3);
    expect(routes[0].path).toBe('/api/v1/users');
    expect(routes[1].path).toBe('/api/v1/users');
    expect(routes[2].path).toBe('/api/v1/users/:id');
  });
});

// ── Hono fetch handler ────────────────────────────────────────────────────

describe('Hono fetch integration', () => {
  it('returns 200 for a registered GET route', async () => {
    const app = createKozo();
    app.get('/hello', () => ({ message: 'hi' }));

    const res = await app.fetch(new Request('http://localhost/hello'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'hi' });
  });

  it('applies Zod coercion/transform on an array body', async () => {
    const app = createKozo();
    app.post('/nums', { body: z.array(z.coerce.number()) }, (ctx) => ({ sum: ctx.body.reduce((a, b) => a + b, 0) }));

    const res = await app.fetch(new Request('http://localhost/nums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(['1', '2', '3']),
    }));
    expect(res.status).toBe(200);
    // Without in-place array rewrite the handler would see strings → '123' concat / NaN.
    expect(await res.json()).toEqual({ sum: 6 });
  });

  it('applies ctx.header() even when the handler returns a value', async () => {
    const app = createKozo();
    app.get('/with-header', (ctx) => {
      ctx.header('X-Custom', 'kozo');
      return { ok: true };
    });

    const res = await app.fetch(new Request('http://localhost/with-header'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-custom')).toBe('kozo');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('validates body and returns 422 on invalid input', async () => {
    const app = createKozo();
    app.post('/users', { body: z.object({ name: z.string() }) }, (ctx) => ctx.json({ ok: true }));

    const res = await app.fetch(new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123 }),
    }));
    expect(res.status).toBe(400);
  });

  it('passes valid body through to handler', async () => {
    const app = createKozo();
    app.post('/echo', { body: z.object({ msg: z.string() }) }, (ctx) => ctx.json({ echo: ctx.body.msg }));

    const res = await app.fetch(new Request('http://localhost/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg: 'hello' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ echo: 'hello' });
  });

  it('injects services into handler context', async () => {
    const db = { query: () => [{ id: 1 }] };
    const app = createKozo({ services: { db } });
    app.get('/data', (ctx) => ctx.json({ rows: (ctx.services as any).db.query() }));

    const res = await app.fetch(new Request('http://localhost/data'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ rows: [{ id: 1 }] });
  });

  it('strips extra body keys (removeAdditional)', async () => {
    const app = createKozo();
    app.post('/strict', { body: z.object({ name: z.string() }) }, (ctx) => ctx.json(ctx.body));

    const res = await app.fetch(new Request('http://localhost/strict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', extra: true, hack: 'drop' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ name: 'Alice' });
  });
});

// ── KozoConfig hooks ────────────────────────────────────────────────────────

describe('KozoConfig hooks', () => {
  it('onError can override the response', async () => {
    const app = createKozo({
      onError: (err) =>
        new Response(JSON.stringify({ custom: err.message }), {
          status: 418,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    app.get('/fail', () => {
      throw new Error('teapot');
    });

    const res = await app.fetch(new Request('http://localhost/fail'));
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ custom: 'teapot' });
  });

  it('onError falls through to KozoError handling when hook returns undefined', async () => {
    const app = createKozo({ onError: () => undefined });
    app.get('/missing', () => {
      throw new NotFoundError('gone');
    });

    const res = await app.fetch(new Request('http://localhost/missing'));
    expect(res.status).toBe(404);
  });

  it('onNotFound can override the 404 response', async () => {
    const app = createKozo({
      onNotFound: () => new Response('custom-not-found', { status: 404 }),
    });

    const res = await app.fetch(new Request('http://localhost/does-not-exist'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('custom-not-found');
  });
});
