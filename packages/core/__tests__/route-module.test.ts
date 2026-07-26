import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { createKozo } from '../src/app.js';
import { resolveRouteModule } from '../src/router.js';
import { defineRoute } from '../src/types.js';

describe('resolveRouteModule', () => {
  it('accepts legacy function default + module exports', () => {
    const handler = () => ({ ok: true });
    const resolved = resolveRouteModule({
      default: handler,
      schema: { response: {} as any },
      meta: { auth: false },
    });
    expect(resolved?.handler).toBe(handler);
    expect(resolved?.meta?.auth).toBe(false);
  });

  it('accepts object default export with handler', () => {
    const handler = () => ({ ok: true });
    const resolved = resolveRouteModule({
      default: {
        schema: { response: {} as any },
        meta: { tags: ['health'] },
        handler,
      },
    });
    expect(resolved?.handler).toBe(handler);
    expect(resolved?.meta?.tags).toEqual(['health']);
  });

  it('returns null for invalid default export', () => {
    expect(resolveRouteModule({ default: {} as any })).toBeNull();
    expect(resolveRouteModule({ default: null as any })).toBeNull();
  });

  it('defineRoute returns a loadable object default', () => {
    const handler = () => ({ n: 1 });
    const route = defineRoute({
      schema: { response: {} as any },
      meta: { auth: true },
      handler,
    });
    const resolved = resolveRouteModule({ default: route });
    expect(resolved?.handler).toBe(handler);
    expect(resolved?.meta?.auth).toBe(true);
  });
});

describe('loadRoutes with object default export', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `kozo-route-obj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'package.json'), '{"type":"module"}', 'utf-8');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads routes from export default { schema, handler, meta }', async () => {
    await mkdir(join(tmpDir, 'ping'), { recursive: true });
    await writeFile(
      join(tmpDir, 'ping', 'get.js'),
      `export default {
        meta: { auth: false },
        handler: () => ({ pong: true }),
      };`,
      'utf-8',
    );

    const app = createKozo();
    await app.loadRoutes(tmpDir);

    const route = app.getRoutes().find((r) => r.path === '/ping');
    expect(route?.meta?.auth).toBe(false);

    const res = await app.fetch(new Request('http://localhost/ping'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });

  it('normalizes bare response schemas before compiling file routes', async () => {
    const zodUrl = pathToFileURL(createRequire(import.meta.url).resolve('zod')).href;
    await mkdir(join(tmpDir, 'login'), { recursive: true });
    await writeFile(
      join(tmpDir, 'login', 'get.js'),
      `import { z } from ${JSON.stringify(zodUrl)};
      export const schema = {
        response: z.object({ token: z.string() }),
      };
      export default (ctx) => ctx.json({ detail: 'Unauthorized' }, 401);`,
      'utf-8',
    );

    const app = createKozo();
    await app.loadRoutes(tmpDir);

    const response = await app.fetch(new Request('http://localhost/login'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: 'Unauthorized' });
  });

  it('loads dynamic route directories with bracket markers', async () => {
    const zodUrl = pathToFileURL(createRequire(import.meta.url).resolve('zod')).href;
    await mkdir(join(tmpDir, 'users', '[id]'), { recursive: true });
    await writeFile(
      join(tmpDir, 'users', '[id]', 'get.js'),
      `import { z } from ${JSON.stringify(zodUrl)};
      export const schema = {
        params: z.object({ id: z.string() }),
      };
      export default (ctx) => ({ id: ctx.params.id });`,
      'utf-8',
    );

    const app = createKozo();
    await app.loadRoutes(tmpDir);

    const response = await app.fetch(new Request('http://localhost/users/user-1'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'user-1' });
  });
});
