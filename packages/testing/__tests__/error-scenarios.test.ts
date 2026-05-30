import { describe, it, expect } from 'vitest';
import { z } from '@kozojs/core';
import { createTestApp } from '../src/index.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('error scenarios — routing', () => {
  it('GET non-existent path returns 404', async () => {
    const client = createTestApp();
    client.app.get('/exists', {}, () => ({ ok: true }));

    const res = await client.get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
  });

  it('POST to GET-only route returns 404', async () => {
    const client = createTestApp();
    client.app.get('/only-get', {}, () => ({ ok: true }));

    const res = await client.post('/only-get', { data: 1 });
    expect(res.status).toBe(404);
  });
});

describe('error scenarios — body validation', () => {
  it('missing required body on POST returns 400', async () => {
    const client = createTestApp();
    client.app.post('/items', {
      body: z.object({ name: z.string(), price: z.number() }),
    }, ({ body }) => ({ ok: true }));

    // Send empty object — missing both fields
    const res = await client.post('/items', {});
    expect(res.status).toBe(400);
    const body = res.json<any>();
    expect(body.status).toBe(400);
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('nested object validation returns correct field paths', async () => {
    const client = createTestApp();
    client.app.post('/profile', {
      body: z.object({
        name: z.string(),
        address: z.object({
          city: z.string(),
          zip: z.string().regex(/^\d{5}$/),
        }),
      }),
    }, ({ body }) => ({ ok: true }));

    const res = await client.post('/profile', {
      name: 'Alice',
      address: { city: 'NYC', zip: 'bad' },
    });
    expect(res.status).toBe(400);
    const body = res.json<any>();
    expect(body.errors.some((e: any) => e.field.includes('zip'))).toBe(true);
  });

  it('array body validation catches invalid elements', async () => {
    const client = createTestApp();
    client.app.post('/numbers', {
      body: z.object({ values: z.array(z.number()) }),
    }, ({ body }) => ({ sum: body.values.reduce((a: number, b: number) => a + b, 0) }));

    const res = await client.post('/numbers', { values: [1, 'two', 3] });
    expect(res.status).toBe(400);
    const body = res.json<any>();
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

describe('error scenarios — headers', () => {
  it('custom Content-Type header is respected (no auto-override)', async () => {
    const client = createTestApp();
    client.app.post('/raw', {}, ({ c }) => {
      const ct = c.req.header('content-type') ?? 'none';
      return { contentType: ct };
    });

    const res = await client.inject({
      method: 'POST',
      url: '/raw',
      headers: { 'Content-Type': 'text/plain' },
      body: 'plain text data',
    });
    expect(res.status).toBe(200);
    expect(res.json<any>().contentType).toBe('text/plain');
  });

  it('lowercase content-type header is respected', async () => {
    const client = createTestApp();
    client.app.post('/raw', {}, ({ c }) => {
      const ct = c.req.header('content-type') ?? 'none';
      return { contentType: ct };
    });

    const res = await client.inject({
      method: 'POST',
      url: '/raw',
      headers: { 'content-type': 'text/xml' },
      body: '<data/>',
    });
    expect(res.status).toBe(200);
    expect(res.json<any>().contentType).toBe('text/xml');
  });
});

describe('error scenarios — inject with all options', () => {
  it('method + url + headers + body + query all work together', async () => {
    const client = createTestApp();
    client.app.post('/full', {
      query: z.object({ mode: z.string() }),
      body: z.object({ value: z.number() }),
    }, ({ query, body, c }) => {
      const auth = c.req.header('x-api-key') ?? 'none';
      return { mode: query.mode, value: body.value, auth };
    });

    const res = await client.inject({
      method: 'POST',
      url: '/full',
      headers: { 'x-api-key': 'secret-123' },
      body: { value: 42 },
      query: { mode: 'test' },
    });
    expect(res.status).toBe(200);
    const json = res.json<any>();
    expect(json.mode).toBe('test');
    expect(json.value).toBe(42);
    expect(json.auth).toBe('secret-123');
  });
});
