import { describe, it, expect } from 'vitest';
import { createKozo, z } from '@kozojs/core';
import { createTestClient, createTestApp } from '../src/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildApp() {
  const app = createKozo();

  app.get('/ping', {}, () => ({ pong: true }));

  app.get('/hello/:name', {
    params: z.object({ name: z.string().min(1) }),
  }, ({ params }) => ({ hello: params.name }));

  app.get('/search', {
    query: z.object({ q: z.string(), page: z.coerce.number().default(1) }),
  }, ({ query }) => ({ results: [], q: query.q, page: query.page }));

  app.post('/users', {
    body: z.object({
      name: z.string().min(2),
      email: z.string().email(),
    }),
  }, ({ body }) => ({ id: 99, ...body }));

  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('@kozojs/testing — createTestClient', () => {
  it('GET basic route', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/ping');
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.json()).toEqual({ pong: true });
  });

  it('GET with URL params', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/hello/world');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ hello: 'world' });
  });

  it('GET with query string via inject()', async () => {
    const client = createTestClient(buildApp());
    const res = await client.inject({ url: '/search?q=kozo&page=2' });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ q: 'kozo', page: 2 });
  });

  it('GET with query shorthand object', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/search', { query: { q: 'test' } });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ q: 'test', page: 1 });
  });

  it('POST with valid body', async () => {
    const client = createTestClient(buildApp());
    const res = await client.post('/users', { name: 'Alice', email: 'alice@example.com' });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ id: 99, name: 'Alice', email: 'alice@example.com' });
  });

  it('exposes the Kozo app instance', () => {
    const app = buildApp();
    const client = createTestClient(app);
    expect(client.app).toBe(app);
  });
});

describe('@kozojs/testing — validation error responses (Part 1 of DX improvements)', () => {
  it('POST invalid email → 400 with structured errors', async () => {
    const client = createTestApp();
    client.app.post('/users', {
      body: z.object({ name: z.string(), email: z.string().email() }),
    }, ({ body }) => ({ ok: true, ...body }));

    const res = await client.post('/users', { name: 'Alice', email: 'not-an-email' });
    expect(res.status).toBe(400);

    const body = res.json<any>();
    expect(body.status).toBe(400);
    expect(body.title).toBe('Validation Failed');
    expect(Array.isArray(body.errors)).toBe(true);

    const err = body.errors[0];
    expect(err.field).toBe('email');
    // Zod v4 code for email validation failure
    expect(typeof err.code).toBe('string');
    expect(err.code).not.toBe('invalid'); // must be the real Zod code
    expect(err.message).toBeTruthy();
  });

  it('POST missing required field → 400 with correct field name', async () => {
    const client = createTestApp();
    client.app.post('/order', {
      body: z.object({ product: z.string(), quantity: z.number().int().positive() }),
    }, ({ body }) => ({ ok: true, ...body }));

    const res = await client.post('/order', { product: 'book' }); // missing quantity
    expect(res.status).toBe(400);
    const body = res.json<any>();
    expect(body.errors.some((e: any) => e.field.includes('quantity'))).toBe(true);
  });

  it('GET invalid query → 400 with structured errors', async () => {
    const client = createTestApp();
    client.app.get('/items', {
      query: z.object({ page: z.coerce.number().int().positive() }),
    }, ({ query }) => ({ items: [], page: query.page }));

    const res = await client.get('/items', { query: { page: '-5' } });
    expect(res.status).toBe(400);
    const body = res.json<any>();
    expect(body.status).toBe(400);
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('validation errors include real Zod codes (not generic "invalid")', async () => {
    const client = createTestApp();
    client.app.post('/data', {
      body: z.object({
        age: z.number().int().min(0).max(120),
      }),
    }, ({ body }) => ({ ok: true }));

    // Send string instead of number
    const res = await client.inject({
      method: 'POST',
      url: '/data',
      body: JSON.stringify({ age: 'not-a-number' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const body = res.json<any>();
    expect(body.errors[0].code).not.toBe('invalid');
  });
});

describe('@kozojs/testing — createTestApp', () => {
  it('creates app + client in one step', async () => {
    const { app, get } = createTestApp();
    app.get('/status', {}, () => ({ status: 'ok' }));
    const res = await get('/status');
    expect(res.status).toBe(200);
  });

  it('custom headers are forwarded', async () => {
    const { app, inject } = createTestApp();
    app.get('/me', {}, ({ c }) => {
      const auth = c.req.header('authorization') ?? 'none';
      return { auth };
    });

    const res = await inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(200);
    expect(res.json<any>().auth).toBe('Bearer test-token');
  });
});
