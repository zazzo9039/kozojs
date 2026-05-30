// ============================================================================
// Tests for per-directory middleware (_middleware.ts) and lifecycle hooks
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { createKozo } from '../src/app.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `kozo-mw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  // Enable ESM for .js files in this temp directory
  await writeFile(join(tmpDir, 'package.json'), '{"type":"module"}', 'utf-8');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** Write an ESM handler module */
async function writeModule(relPath: string, code: string): Promise<void> {
  const fullPath = join(tmpDir, relPath);
  await mkdir(join(fullPath, '..'), { recursive: true });
  await writeFile(fullPath, code, 'utf-8');
}

/** Fire a request against a Kozo app */
async function request(app: ReturnType<typeof createKozo>, method: string, path: string, opts?: RequestInit) {
  const res = await app.fetch(new Request(`http://localhost${path}`, { method, ...opts }));
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
}

// ─────────────────────────────────────────────
// Per-directory middleware tests
// ─────────────────────────────────────────────

describe('Per-directory middleware (_middleware.ts)', () => {
  it('applies root _middleware.js to all routes', async () => {
    // Root middleware adds a custom header
    await writeModule('_middleware.js', `
      export default async function (c, next) {
        c.header('X-Root-MW', 'applied');
        await next();
      }
    `);
    await writeModule('health/get.js', `
      export default function (c) { return c.json({ ok: true }); }
    `);

    const app = createKozo();
    await app.loadRoutes(tmpDir);

    const res = await request(app, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Root-MW')).toBe('applied');
  });

  it('applies scoped _middleware.js only to matching routes', async () => {
    // Admin middleware adds header
    await writeModule('admin/_middleware.js', `
      export default async function (c, next) {
        c.header('X-Admin-MW', 'applied');
        await next();
      }
    `);
    await writeModule('admin/users/get.js', `
      export default function (c) { return c.json({ users: [] }); }
    `);
    await writeModule('public/get.js', `
      export default function (c) { return c.json({ public: true }); }
    `);

    const app = createKozo();
    await app.loadRoutes(tmpDir);

    // Admin route gets the middleware
    const adminRes = await request(app, 'GET', '/admin/users');
    expect(adminRes.status).toBe(200);
    expect(adminRes.headers.get('X-Admin-MW')).toBe('applied');

    // Public route does NOT get the admin middleware
    const publicRes = await request(app, 'GET', '/public');
    expect(publicRes.status).toBe(200);
    expect(publicRes.headers.get('X-Admin-MW')).toBeNull();
  });

  it('executes middleware in root → leaf order', async () => {
    const order: string[] = [];

    // We use response headers to track execution order since we can't
    // share module-level state with dynamically-imported ESM files.
    await writeModule('_middleware.js', `
      export default async function (c, next) {
        c.header('X-Order', (c.res.headers.get('X-Order') || '') + 'root,');
        await next();
      }
    `);
    await writeModule('api/_middleware.js', `
      export default async function (c, next) {
        c.header('X-Order', (c.res.headers.get('X-Order') || '') + 'api,');
        await next();
      }
    `);
    await writeModule('api/test/get.js', `
      export default function (c) { return c.json({ ok: true }); }
    `);

    const app = createKozo();
    await app.loadRoutes(tmpDir);

    const res = await request(app, 'GET', '/api/test');
    expect(res.status).toBe(200);
    // Root middleware runs before api middleware
    const orderHeader = res.headers.get('X-Order') ?? '';
    expect(orderHeader).toContain('root,');
    expect(orderHeader.indexOf('root,')).toBeLessThan(orderHeader.indexOf('api,'));
  });

  it('middleware can short-circuit (reject requests)', async () => {
    await writeModule('protected/_middleware.js', `
      export default async function (c, next) {
        const auth = c.req.header('authorization');
        if (!auth) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
        await next();
      }
    `);
    await writeModule('protected/secret/get.js', `
      export default function (c) { return c.json({ secret: 'data' }); }
    `);

    const app = createKozo();
    await app.loadRoutes(tmpDir);

    // Without auth header → 401
    const res1 = await request(app, 'GET', '/protected/secret');
    expect(res1.status).toBe(401);
    expect(res1.body).toEqual({ error: 'Unauthorized' });

    // With auth header → 200
    const res2 = await request(app, 'GET', '/protected/secret', {
      headers: { authorization: 'Bearer test' },
    });
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ secret: 'data' });
  });
});

// ─────────────────────────────────────────────
// Lifecycle hooks tests
// ─────────────────────────────────────────────

describe('Lifecycle hooks (onStart/onStop)', () => {
  it('onStop is called during shutdown', async () => {
    const onStop = vi.fn();

    const app = createKozo({
      services: { db: { close: vi.fn() } },
      onStop,
    });

    app.get('/test', (ctx) => ctx.json({ ok: true }));

    await app.shutdown();

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledWith({ services: { db: { close: expect.any(Function) } } });
  });

  it('onStop errors do not prevent shutdown', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = createKozo({
      onStop: async () => { throw new Error('cleanup failed'); },
    });

    // Should not throw
    await expect(app.shutdown()).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });
});
