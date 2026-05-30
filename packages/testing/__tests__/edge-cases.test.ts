import { describe, it, expect } from 'vitest';
import { createKozo, z } from '@kozojs/core';
import { createTestClient, createTestApp } from '../src/index.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildApp() {
  const app = createKozo();

  // Plain text response
  app.get('/text', {}, ({ c }) => c.text('hello plain'));

  // HTML response
  app.get('/html', {}, ({ c }) => c.html('<h1>Hello</h1>'));

  // Custom status codes
  app.post('/created', {}, ({ json }) => json({ id: 1 }, 201));

  // 204 No Content
  app.delete('/item', {}, ({ c }) => c.body(null, 204));

  // Redirect
  app.get('/old', {}, ({ c }) => c.redirect('/new', 302));

  // 500 error (throws)
  app.get('/boom', {}, () => {
    throw new Error('Unexpected failure');
  });

  // Unicode body
  app.post('/echo', {
    body: z.object({ text: z.string() }),
  }, ({ body }) => ({ echo: body.text }));

  // Query with defaults
  app.get('/search', {
    query: z.object({ q: z.string(), page: z.coerce.number().default(1) }),
  }, ({ query }) => ({ q: query.q, page: query.page }));

  // Simple ping
  app.get('/ping', {}, () => ({ pong: true }));

  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('edge cases — response types', () => {
  it('plain text response — json() throws descriptive error', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/text');
    expect(res.status).toBe(200);
    expect(res.body).toBe('hello plain');
    expect(() => res.json()).toThrow('Failed to parse response body as JSON');
  });

  it('HTML response — json() throws with body preview', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/html');
    expect(res.status).toBe(200);
    expect(res.body).toContain('<h1>Hello</h1>');
    expect(() => res.json()).toThrow('Failed to parse response body as JSON');
  });

  it('empty body — json() throws descriptive error', async () => {
    const client = createTestClient(buildApp());
    const res = await client.delete('/item');
    // Body is empty or null for 204
    expect(() => res.json()).toThrow('Failed to parse response body as JSON');
  });
});

describe('edge cases — status codes', () => {
  it('201 Created with JSON body', async () => {
    const client = createTestClient(buildApp());
    const res = await client.post('/created');
    expect(res.status).toBe(201);
    expect(res.ok).toBe(true);
    expect(res.json()).toEqual({ id: 1 });
  });

  it('204 No Content', async () => {
    const client = createTestClient(buildApp());
    const res = await client.delete('/item');
    expect(res.status).toBe(204);
    expect(res.ok).toBe(true);
  });

  it('302 redirect', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/old');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/new');
    expect(res.ok).toBe(false);
  });

  it('500 on thrown error', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/boom');
    expect(res.status).toBe(500);
    expect(res.ok).toBe(false);
  });
});

describe('edge cases — query parameters', () => {
  it('special characters in query values are properly encoded', async () => {
    const client = createTestClient(buildApp());
    const res = await client.get('/search', { query: { q: 'hello world&foo=bar' } });
    expect(res.status).toBe(200);
    const json = res.json<any>();
    expect(json.q).toBe('hello world&foo=bar');
  });

  it('query object appends to existing query string in URL', async () => {
    const client = createTestClient(buildApp());
    const res = await client.inject({
      url: '/search?q=base',
      query: { page: '3' },
    });
    expect(res.status).toBe(200);
    const json = res.json<any>();
    expect(json.q).toBe('base');
    expect(json.page).toBe(3);
  });
});

describe('edge cases — unicode', () => {
  it('unicode in POST body round-trips correctly', async () => {
    const client = createTestClient(buildApp());
    const res = await client.post('/echo', { text: 'café éèê 日本語 🚀' });
    expect(res.status).toBe(200);
    expect(res.json<any>().echo).toBe('café éèê 日本語 🚀');
  });
});

describe('edge cases — HTTP methods', () => {
  it('HEAD request returns status but empty body', async () => {
    const client = createTestClient(buildApp());
    const res = await client.inject({ method: 'HEAD', url: '/ping' });
    // HEAD should return 200 with empty body
    expect(res.status).toBe(200);
    expect(res.body).toBe('');
  });

  it('OPTIONS request via inject', async () => {
    const client = createTestClient(buildApp());
    const res = await client.inject({ method: 'OPTIONS', url: '/ping' });
    // Framework may return 204 or 404 for OPTIONS depending on CORS config
    expect(typeof res.status).toBe('number');
  });
});
