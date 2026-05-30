import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

import { scanRoutes, scanMiddleware } from '../src/routing/scan.js';

async function writeRoute(routesDir: string, relativePath: string, content?: string): Promise<void> {
  const filePath = path.join(routesDir, relativePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(
    filePath,
    content ??
      `export const schema = { body: z.object({ name: z.string() }) };
export default async (ctx) => ctx.json({ ok: true });`,
    'utf8',
  );
}

describe('scanRoutes', () => {
  let routesDir: string;

  beforeEach(async () => {
    routesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-scan-'));
  });

  afterEach(async () => {
    await fs.remove(routesDir);
  });

  it('maps nested dynamic segments to URL params', async () => {
    await writeRoute(routesDir, 'users/[id]/get.ts');
    await writeRoute(routesDir, 'posts/[id]/comments/[commentId]/get.ts');

    const routes = await scanRoutes({ routesDir });

    expect(routes.map((r) => r.path).sort()).toEqual(['/posts/:id/comments/:commentId', '/users/:id']);
    expect(routes.find((r) => r.path === '/users/:id')?.params).toEqual(['id']);
  });

  it('detects HTTP method from filename', async () => {
    await writeRoute(routesDir, 'items/post.ts', 'export default () => ({ ok: true });');

    const routes = await scanRoutes({ routesDir });
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('post');
  });

  it('ignores private and test files', async () => {
    await writeRoute(routesDir, '_private.ts');
    await writeRoute(routesDir, 'health.test.ts');
    await writeRoute(routesDir, 'health.ts');

    const routes = await scanRoutes({ routesDir });
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/health');
  });

  it('detects body and query schema exports', async () => {
    await writeRoute(
      routesDir,
      'signup/post.ts',
      `export const bodySchema = z.object({ email: z.string() });
export const query = z.object({ ref: z.string().optional() });
export default async () => ({ ok: true });`,
    );

    const routes = await scanRoutes({ routesDir });
    expect(routes[0].hasBodySchema).toBe(true);
    expect(routes[0].hasQuerySchema).toBe(true);
  });

  it('sorts static routes before dynamic ones', async () => {
    await writeRoute(routesDir, 'users/[id]/get.ts');
    await writeRoute(routesDir, 'users/me/get.ts');

    const routes = await scanRoutes({ routesDir });
    expect(routes[0].path).toBe('/users/me');
    expect(routes[1].path).toBe('/users/:id');
  });
});

describe('scanMiddleware', () => {
  let routesDir: string;

  beforeEach(async () => {
    routesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-mw-'));
  });

  afterEach(async () => {
    await fs.remove(routesDir);
  });

  it('finds per-directory _middleware.ts files', async () => {
    const adminMw = path.join(routesDir, 'admin', '_middleware.ts');
    const rootMw = path.join(routesDir, '_middleware.ts');
    await fs.ensureDir(path.dirname(adminMw));
    await fs.writeFile(adminMw, 'export default async (c, next) => next();', 'utf8');
    await fs.writeFile(rootMw, 'export default async (c, next) => next();', 'utf8');

    const middleware = await scanMiddleware({ routesDir });

    expect(middleware.map((m) => m.pathPrefix).sort()).toEqual(['/*', '/admin/*']);
    expect(middleware[0].pathPrefix).toBe('/*');
  });
});
