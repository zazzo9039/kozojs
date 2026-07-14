// ============================================================================
// Tests for app.mountDocs() — Swagger UI + OpenAPI spec with safe defaults
// ============================================================================

import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { createKozo } from '../src/app.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

function appWithRoutes() {
  const app = createKozo();
  app.get(
    '/api/users/:id',
    { params: z.object({ id: z.string() }), response: z.object({ id: z.string() }) as any },
    (ctx) => ctx.json({ id: '1' }),
  );
  app.post(
    '/api/billing/checkout',
    { body: z.object({ priceId: z.string() }) },
    () => ({ ok: true }),
  );
  return app;
}

describe('app.mountDocs()', () => {
  it('serves Swagger UI and the OpenAPI spec outside production', async () => {
    const app = appWithRoutes();
    app.mountDocs({ title: 'test-api', version: '1.2.3' });

    const ui = await app.fetch(new Request('http://t.local/docs'));
    expect(ui.status).toBe(200);
    const html = await ui.text();
    expect(html).toContain('test-api');
    expect(html).toContain('/docs.json');

    const specRes = await app.fetch(new Request('http://t.local/docs.json'));
    expect(specRes.status).toBe(200);
    const spec = await specRes.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toMatchObject({ title: 'test-api', version: '1.2.3' });
    expect(Object.keys(spec.paths)).toContain('/api/users/{id}');
    expect(Object.keys(spec.paths)).toContain('/api/billing/checkout');
  });

  it('does not list the docs routes themselves in the spec', async () => {
    const app = appWithRoutes();
    app.mountDocs();
    const spec = await (await app.fetch(new Request('http://t.local/docs.json'))).json();
    expect(Object.keys(spec.paths)).not.toContain('/docs');
    expect(Object.keys(spec.paths)).not.toContain('/docs.json');
  });

  it('derives tags skipping a leading api segment', async () => {
    const app = appWithRoutes();
    app.mountDocs();
    const spec = await (await app.fetch(new Request('http://t.local/docs.json'))).json();
    const tagNames = (spec.tags as Array<{ name: string }>).map((t) => t.name);
    expect(tagNames).toContain('Users');
    expect(tagNames).toContain('Billing');
    expect(tagNames).not.toContain('Api');
    expect(spec.paths['/api/billing/checkout'].post.tags).toEqual(['Billing']);
  });

  it('is OFF in production by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = appWithRoutes();
    app.mountDocs();
    expect((await app.fetch(new Request('http://t.local/docs'))).status).toBe(404);
    expect((await app.fetch(new Request('http://t.local/docs.json'))).status).toBe(404);
  });

  it('mounts in production with an explicit enabled: true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = appWithRoutes();
    app.mountDocs({ enabled: true });
    expect((await app.fetch(new Request('http://t.local/docs'))).status).toBe(200);
  });

  it('enabled: false unmounts regardless of environment', async () => {
    const app = appWithRoutes();
    app.mountDocs({ enabled: false });
    expect((await app.fetch(new Request('http://t.local/docs'))).status).toBe(404);
  });

  it('respects a custom path', async () => {
    const app = appWithRoutes();
    app.mountDocs({ path: '/api/docs' });
    expect((await app.fetch(new Request('http://t.local/api/docs'))).status).toBe(200);
    const spec = await (await app.fetch(new Request('http://t.local/api/docs.json'))).json();
    expect(spec.openapi).toBe('3.1.0');
  });

  it('generates the spec lazily: routes registered after mountDocs are included', async () => {
    const app = createKozo();
    app.mountDocs();
    app.get('/api/late', {}, () => ({ late: true }));
    const spec = await (await app.fetch(new Request('http://t.local/docs.json'))).json();
    expect(Object.keys(spec.paths)).toContain('/api/late');
  });

  it('marks both docs routes as auth: false', () => {
    const app = appWithRoutes();
    app.mountDocs();
    const docsRoutes = app.getRoutes().filter((r) => r.path.startsWith('/docs'));
    expect(docsRoutes).toHaveLength(2);
    for (const r of docsRoutes) expect(r.meta?.auth).toBe(false);
  });
});
