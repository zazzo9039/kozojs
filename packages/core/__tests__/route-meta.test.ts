import { describe, it, expect } from 'vitest';
import { createKozo } from '../src/index.js';
import { z } from 'zod';

describe('Manual route meta (A1)', () => {
  it('preserves meta on manual routes via getRoutes()', () => {
    const app = createKozo();
    app.get('/public', { response: z.object({ ok: z.boolean() }) }, () => ({ ok: true }), {
      auth: false,
      tags: ['health'],
    });

    const route = app.getRoutes().find((r) => r.path === '/public');
    expect(route).toBeDefined();
    expect(route?.meta?.auth).toBe(false);
    expect(route?.meta?.tags).toEqual(['health']);
  });

  it('leaves meta undefined when not provided (no crash)', () => {
    const app = createKozo();
    app.get('/no-meta', () => ({ ok: true }));

    const route = app.getRoutes().find((r) => r.path === '/no-meta');
    expect(route).toBeDefined();
    expect(route?.meta).toBeUndefined();
  });

  it('threads meta through app.group()', () => {
    const app = createKozo();
    app.group('/admin', (r) => {
      r.get('/stats', { response: z.object({ n: z.number() }) }, () => ({ n: 1 }), {
        auth: true,
        tags: ['admin'],
      });
    });

    const route = app.getRoutes().find((r) => r.path === '/admin/stats');
    expect(route?.meta?.auth).toBe(true);
    expect(route?.meta?.tags).toEqual(['admin']);
  });
});

describe('KozoGroup.delete method bug fix (A1)', () => {
  it('registers DELETE (not POST) for the no-schema group form', () => {
    const app = createKozo();
    app.group('/items', (r) => {
      r.delete('/:id', () => ({ deleted: true }));
    });

    const route = app.getRoutes().find((r) => r.path === '/items/:id');
    expect(route).toBeDefined();
    expect(route?.method).toBe('delete');
  });
});

describe('Configurable body limit (A2)', () => {
  it('accepts maxBodyBytes in config', () => {
    const app = createKozo({ maxBodyBytes: 5 * 1024 * 1024 });
    expect(app).toBeDefined();
  });
});
