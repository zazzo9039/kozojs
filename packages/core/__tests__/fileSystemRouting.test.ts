import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { applyFileSystemRouting, createFileSystemRouting } from '../src/middleware/fileSystemRouting.js';
import type { RoutesManifest } from '../src/middleware/fileSystemRouting.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Write a temporary routes-manifest.json and return its path. */
async function writeManifest(dir: string, manifest: RoutesManifest): Promise<string> {
  const path = join(dir, 'routes-manifest.json');
  await writeFile(path, JSON.stringify(manifest, null, 2), 'utf-8');
  return path;
}

/** Write a minimal handler module (.mjs) that returns a JSON response. */
async function writeHandler(dir: string, name: string, body: unknown = { ok: true }): Promise<string> {
  const path = join(dir, `${name}.mjs`);
  await writeFile(
    path,
    `export default function handler(c) { return c.json(${JSON.stringify(body)}); }`,
    'utf-8',
  );
  return path;
}

/** Fire a GET request against a Hono app and return the parsed JSON body. */
async function get(app: Hono, path: string): Promise<{ status: number; body: unknown }> {
  const req = new Request(`http://localhost${path}`);
  const res = await app.fetch(req);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ─────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `kozo-fsr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('applyFileSystemRouting', () => {
  describe('manifest loading', () => {
    it('gracefully skips when manifest is missing (no error thrown)', async () => {
      const app = new Hono();
      const nonExistentPath = join(tmpDir, 'does-not-exist.json');

      await expect(
        applyFileSystemRouting(app, { manifestPath: nonExistentPath }),
      ).resolves.toBeUndefined();
    });

    it('calls onMissingManifest callback when manifest is absent', async () => {
      const app = new Hono();
      const onMissingManifest = vi.fn();
      const nonExistentPath = join(tmpDir, 'does-not-exist.json');

      await applyFileSystemRouting(app, {
        manifestPath: nonExistentPath,
        onMissingManifest,
      });

      expect(onMissingManifest).toHaveBeenCalledOnce();
      expect(onMissingManifest.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('calls onMissingManifest when manifest JSON is malformed', async () => {
      const badPath = join(tmpDir, 'routes-manifest.json');
      await writeFile(badPath, '{ invalid json }', 'utf-8');

      const onMissingManifest = vi.fn();
      const app = new Hono();

      await applyFileSystemRouting(app, {
        manifestPath: badPath,
        onMissingManifest,
      });

      expect(onMissingManifest).toHaveBeenCalledOnce();
    });

    it('does NOT register any routes when manifest is missing', async () => {
      const app = new Hono();
      app.get('/health', c => c.json({ status: 'up' }));

      await applyFileSystemRouting(app, {
        manifestPath: join(tmpDir, 'missing.json'),
      });

      const { status, body } = await get(app, '/health');
      expect(status).toBe(200);
      expect(body).toEqual({ status: 'up' });
    });
  });

  describe('route registration', () => {
    it('registers a GET route from the manifest', async () => {
      const handlerPath = await writeHandler(tmpDir, 'users', { users: [] });
      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/users',
            method: 'get',
            handler: handlerPath,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
        ],
      });

      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath });

      const { status, body } = await get(app, '/users');
      expect(status).toBe(200);
      expect(body).toEqual({ users: [] });
    });

    it('registers multiple routes with different methods', async () => {
      const getHandler = await writeHandler(tmpDir, 'get-users', { list: true });
      const postHandler = await writeHandler(tmpDir, 'post-users', { created: true });

      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/users',
            method: 'get',
            handler: getHandler,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
          {
            path: '/users',
            method: 'post',
            handler: postHandler,
            params: [],
            hasBodySchema: true,
            hasQuerySchema: false,
          },
        ],
      });

      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath });

      const getRes = await app.fetch(new Request('http://localhost/users', { method: 'GET' }));
      expect(getRes.status).toBe(200);
      expect(await getRes.json()).toEqual({ list: true });

      const postRes = await app.fetch(new Request('http://localhost/users', { method: 'POST' }));
      expect(postRes.status).toBe(200);
      expect(await postRes.json()).toEqual({ created: true });
    });

    it('registers a route with dynamic params (:id)', async () => {
      const handlerPath = join(tmpDir, 'user-by-id.mjs');
      await writeFile(
        handlerPath,
        `export default function handler(c) { return c.json({ id: c.req.param('id') }); }`,
        'utf-8',
      );

      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/users/:id',
            method: 'get',
            handler: handlerPath,
            params: ['id'],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
        ],
      });

      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath });

      const { status, body } = await get(app, '/users/42');
      expect(status).toBe(200);
      expect(body).toEqual({ id: '42' });
    });

    it('registers all supported HTTP methods', async () => {
      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

      const routes = await Promise.all(
        methods.map(async method => {
          const handlerPath = await writeHandler(tmpDir, method, { method });
          return {
            path: `/${method}-test`,
            method,
            handler: handlerPath,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          };
        }),
      );

      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes,
      });

      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath });

      for (const method of methods) {
        const res = await app.fetch(
          new Request(`http://localhost/${method}-test`, { method: method.toUpperCase() }),
        );
        expect(res.status, `Expected 200 for ${method.toUpperCase()}`).toBe(200);
        expect(await res.json()).toEqual({ method });
      }
    });

    it('skips a route whose handler has no default export (warns instead of throwing)', async () => {
      const badHandler = join(tmpDir, 'no-default.mjs');
      // Named export, not default
      await writeFile(badHandler, `export function handler(c) { return c.json({}); }`, 'utf-8');

      const goodHandler = await writeHandler(tmpDir, 'good', { good: true });

      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/bad',
            method: 'get',
            handler: badHandler,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
          {
            path: '/good',
            method: 'get',
            handler: goodHandler,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
        ],
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath });
      warnSpy.mockRestore();

      // /bad should 404 (route never registered)
      const bad = await get(app, '/bad');
      expect(bad.status).toBe(404);

      // /good should work fine
      const good = await get(app, '/good');
      expect(good.status).toBe(200);
      expect(good.body).toEqual({ good: true });
    });

    it('skips a route pointing to a non-existent handler file (warns instead of throwing)', async () => {
      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/ghost',
            method: 'get',
            handler: join(tmpDir, 'ghost.mjs'),
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
        ],
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath });
      warnSpy.mockRestore();

      const { status } = await get(app, '/ghost');
      expect(status).toBe(404);
    });
  });

  describe('route ordering (manifest routes before user-defined routes)', () => {
    it('manifest routes registered first are matched before user-defined routes', async () => {
      const manifestHandler = await writeHandler(tmpDir, 'manifest-health', { source: 'manifest' });
      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/health',
            method: 'get',
            handler: manifestHandler,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
        ],
      });

      const app = new Hono();
      // Apply manifest FIRST
      await applyFileSystemRouting(app, { manifestPath });
      // Then register user route for the same path
      app.get('/health', c => c.json({ source: 'user' }));

      const { body } = await get(app, '/health');
      // Hono matches first registered route
      expect(body).toEqual({ source: 'manifest' });
    });
  });

  describe('verbose logging', () => {
    it('logs routes when verbose=true', async () => {
      const handlerPath = await writeHandler(tmpDir, 'verbose-test', {});
      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/verbose',
            method: 'get',
            handler: handlerPath,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
        ],
      });

      const logSpy = vi.fn();
      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath, verbose: true, logger: logSpy });

      expect(logSpy).toHaveBeenCalled();
      const allLogs = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(allLogs).toContain('/verbose');
    });

    it('does NOT log when verbose=false (default)', async () => {
      const handlerPath = await writeHandler(tmpDir, 'quiet-test', {});
      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [
          {
            path: '/quiet',
            method: 'get',
            handler: handlerPath,
            params: [],
            hasBodySchema: false,
            hasQuerySchema: false,
          },
        ],
      });

      const logSpy = vi.fn();
      const app = new Hono();
      await applyFileSystemRouting(app, { manifestPath, logger: logSpy }); // verbose defaults to false

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('empty manifest', () => {
    it('handles an empty routes array without errors', async () => {
      const manifestPath = await writeManifest(tmpDir, {
        version: 1,
        generatedAt: new Date().toISOString(),
        routes: [],
      });

      const app = new Hono();
      await expect(applyFileSystemRouting(app, { manifestPath })).resolves.toBeUndefined();
    });
  });
});

// ─────────────────────────────────────────────
// createFileSystemRouting factory
// ─────────────────────────────────────────────

describe('createFileSystemRouting', () => {
  it('returns a function that applies routing when called with an app', async () => {
    const handlerPath = await writeHandler(tmpDir, 'factory-test', { factory: true });
    const manifestPath = await writeManifest(tmpDir, {
      version: 1,
      generatedAt: new Date().toISOString(),
      routes: [
        {
          path: '/factory',
          method: 'get',
          handler: handlerPath,
          params: [],
          hasBodySchema: false,
          hasQuerySchema: false,
        },
      ],
    });

    const fsr = createFileSystemRouting({ manifestPath });
    const app = new Hono();
    await fsr(app);

    const { status, body } = await get(app, '/factory');
    expect(status).toBe(200);
    expect(body).toEqual({ factory: true });
  });

  it('pre-bakes options so they are reusable', async () => {
    const onMissingManifest = vi.fn();
    const fsr = createFileSystemRouting({
      manifestPath: join(tmpDir, 'no-manifest.json'),
      onMissingManifest,
    });

    const app1 = new Hono();
    const app2 = new Hono();
    await fsr(app1);
    await fsr(app2);

    expect(onMissingManifest).toHaveBeenCalledTimes(2);
  });
});
