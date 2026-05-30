// ============================================================================
// Integration tests — full HTTP request → response through a real Kozo server
// ============================================================================

import { describe, it, expect, afterAll } from 'vitest';
import { z } from 'zod';
import { createKozo } from '../src/app.js';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Fetch against the app's internal Hono fetch (no real TCP port needed). */
function req(app: ReturnType<typeof createKozo>, path: string, init?: RequestInit) {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

function json(app: ReturnType<typeof createKozo>, path: string, body: unknown, method = 'POST') {
  return req(app, path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── App fixture ─────────────────────────────────────────────────────────

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

const app = createKozo({
  services: { version: '1.0.0' },
});

// Simple GET
app.get('/health', (ctx) => ({ status: 'ok', version: ctx.services.version }));

// GET with query validation
app.get('/search', { query: z.object({ q: z.string(), limit: z.coerce.number().int().optional() }) }, (ctx) => {
  return { results: [], query: ctx.query.q, limit: ctx.query.limit ?? 10 };
});

// GET with path params
app.get('/users/:id', { params: z.object({ id: z.string().uuid() }) }, (ctx) => {
  return { id: ctx.params.id, name: 'Test User', email: 'test@example.com' };
});

// POST with body validation
app.post('/users', {
  body: z.object({ name: z.string().min(1), email: z.string().email() }),
  response: UserSchema,
}, (ctx) => {
  return { id: '550e8400-e29b-41d4-a716-446655440000', name: ctx.body.name, email: ctx.body.email };
});

// PUT with body + params
app.put('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ name: z.string().min(1).optional(), email: z.string().email().optional() }),
}, (ctx) => {
  return { id: ctx.params.id, name: ctx.body.name ?? 'unchanged', email: ctx.body.email ?? 'unchanged' };
});

// DELETE
app.delete('/users/:id', { params: z.object({ id: z.string().uuid() }) }, (ctx) => {
  return { deleted: true, id: ctx.params.id };
});

// Route that throws a KozoError
import { NotFoundError, BadRequestError, ForbiddenError } from '../src/errors.js';

app.get('/error/not-found', () => { throw new NotFoundError('Resource not found'); });
app.get('/error/bad-request', () => { throw new BadRequestError('Invalid input'); });
app.get('/error/forbidden', () => { throw new ForbiddenError('Access denied'); });
app.get('/error/unexpected', () => { throw new Error('Unexpected boom'); });

// Route that returns raw Response
app.get('/raw', () => new Response('raw body', { status: 200, headers: { 'X-Custom': 'yes' } }));

// Async handler
app.get('/async', async () => {
  await new Promise((r) => setTimeout(r, 10));
  return { async: true };
});

// Route group
app.group('/api/v1', (r) => {
  r.get('/ping', () => ({ pong: true }));
  r.post('/echo', { body: z.object({ msg: z.string() }) }, (ctx) => ({ echo: ctx.body.msg }));
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('Integration: GET routes', () => {
  it('GET /health returns 200 with JSON', async () => {
    const res = await req(app, '/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: 'ok', version: '1.0.0' });
  });

  it('GET /search with valid query', async () => {
    const res = await req(app, '/search?q=hello&limit=5');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.query).toBe('hello');
    expect(data.limit).toBe(5);
  });

  it('GET /search with missing required query param returns 400', async () => {
    const res = await req(app, '/search');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.title).toContain('Validation');
  });

  it('GET /users/:id with valid UUID', async () => {
    const res = await req(app, '/users/550e8400-e29b-41d4-a716-446655440000');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(data.name).toBe('Test User');
  });

  it('GET /users/:id with invalid UUID returns 400', async () => {
    const res = await req(app, '/users/not-a-uuid');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe(400);
  });
});

describe('Integration: POST/PUT/DELETE routes', () => {
  it('POST /users with valid body returns 200', async () => {
    const res = await json(app, '/users', { name: 'Alice', email: 'alice@example.com' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('Alice');
    expect(data.email).toBe('alice@example.com');
    expect(data.id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('POST /users with invalid email returns 400', async () => {
    const res = await json(app, '/users', { name: 'Alice', email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('POST /users with empty body returns 400', async () => {
    const res = await json(app, '/users', {});
    expect(res.status).toBe(400);
  });

  it('POST /users with extra fields strips them', async () => {
    const res = await json(app, '/users', { name: 'Bob', email: 'bob@test.com', admin: true });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).not.toHaveProperty('admin');
  });

  it('PUT /users/:id with partial body', async () => {
    const res = await json(app, '/users/550e8400-e29b-41d4-a716-446655440000', { name: 'Updated' }, 'PUT');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('Updated');
    expect(data.email).toBe('unchanged');
  });

  it('DELETE /users/:id', async () => {
    const res = await req(app, '/users/550e8400-e29b-41d4-a716-446655440000', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
  });
});

describe('Integration: Error handling (RFC 7807)', () => {
  it('NotFoundError returns 404 problem+json', async () => {
    const res = await req(app, '/error/not-found');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const data = await res.json();
    expect(data.status).toBe(404);
    expect(data.title).toBe('Resource not found');
    expect(data.instance).toBe('/error/not-found');
  });

  it('BadRequestError returns 400 problem+json', async () => {
    const res = await req(app, '/error/bad-request');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.status).toBe(400);
  });

  it('ForbiddenError returns 403 problem+json', async () => {
    const res = await req(app, '/error/forbidden');
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.status).toBe(403);
    expect(data.title).toBe('Access denied');
  });

  it('Unexpected error returns 500 problem+json', async () => {
    const res = await req(app, '/error/unexpected');
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.status).toBe(500);
  });

  it('Unknown route returns 404 from Hono', async () => {
    const res = await req(app, '/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('Integration: Advanced features', () => {
  it('Raw Response pass-through', async () => {
    const res = await req(app, '/raw');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-custom')).toBe('yes');
    expect(await res.text()).toBe('raw body');
  });

  it('Async handler', async () => {
    const res = await req(app, '/async');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.async).toBe(true);
  });

  it('Route group /api/v1/ping', async () => {
    const res = await req(app, '/api/v1/ping');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pong).toBe(true);
  });

  it('Route group /api/v1/echo with body', async () => {
    const res = await json(app, '/api/v1/echo', { msg: 'hello' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.echo).toBe('hello');
  });

  it('getRoutes() returns all registered routes', () => {
    const routes = app.getRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(10);
    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('get /health');
    expect(paths).toContain('post /users');
    expect(paths).toContain('get /api/v1/ping');
  });

  it('generateClient() produces valid SDK code', () => {
    const code = app.generateClient({ baseUrl: 'http://localhost:3000' });
    expect(code).toContain('class KozoClient');
    expect(code).toContain('http://localhost:3000');
    // Verify Zod v4 schemas are properly serialized
    expect(code).toContain('z.string()');
    expect(code).toContain('z.object(');
  });

  it('generateClient(string) includes Zod schemas (same default as options form)', () => {
    const code = app.generateClient('http://localhost:3000');
    expect(code).toContain("import { z } from 'zod'");
    expect(code).toContain('http://localhost:3000');
    expect(code).toContain('z.string()');
  });

  it('Content-Type is application/json for JSON responses', async () => {
    const res = await req(app, '/health');
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
