// ============================================================================
// Tests for compiler.ts — compileRouteHandler integration
// ============================================================================

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createKozo } from '../src/app.js';

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

    const good = await app.fetch(new Request('http://localhost/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    }));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ created: 'Alice' });

    const bad = await app.fetch(new Request('http://localhost/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123 }),
    }));
    expect(bad.status).toBe(400);
  });
});
