/**
 * @module auth/register-auth
 * Ensures JWT runs before directory _middleware.ts when using registerAuthBeforeLoadRoutes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { createKozo } from '@kozojs/core';
import { registerAuthBeforeLoadRoutes, setupAuth, createJWT } from '../src/index.js';

const SECRET = 'test-secret-must-be-at-least-32-characters-long';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `kozo-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tmpDir, { recursive: true });
  await writeFile(join(tmpDir, 'package.json'), '{"type":"module"}', 'utf-8');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeModule(relPath: string, code: string) {
  const fullPath = join(tmpDir, relPath);
  await mkdir(join(fullPath, '..'), { recursive: true });
  await writeFile(fullPath, code, 'utf-8');
}

async function request(app: ReturnType<typeof createKozo>, path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.fetch(new Request(`http://localhost${path}`, { headers }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('registerAuthBeforeLoadRoutes', () => {
  it('allows _middleware to read user.role after JWT (before loadRoutes)', async () => {
    await writeModule('admin/_middleware.js', `
      export default async function (c, next) {
        const user = c.get('user');
        if (!user || user.role !== 'admin') {
          return c.json({ detail: 'Forbidden' }, 403);
        }
        await next();
      }
    `);
    await writeModule('admin/items/get.js', `
      export default function () { return { items: [] }; }
    `);
    await writeModule('health/get.js', `
      export const meta = { auth: false };
      export default function () { return { ok: true }; }
    `);

    const app = createKozo();
    await registerAuthBeforeLoadRoutes(app, SECRET, { routesDir: tmpDir, prefix: '' });
    await app.loadRoutes(tmpDir);

    const userToken = await createJWT({ role: 'user' }, SECRET, { expiresIn: '1h' });
    const adminToken = await createJWT({ role: 'admin' }, SECRET, { expiresIn: '1h' });

    expect((await request(app, '/health')).status).toBe(200);
    expect((await request(app, '/admin/items', userToken)).status).toBe(403);
    expect((await request(app, '/admin/items', adminToken)).status).toBe(200);
  });
});

describe('setupAuth (after loadRoutes)', () => {
  it('runs JWT after _middleware — admin guard sees no user (documented footgun)', async () => {
    await writeModule('admin/_middleware.js', `
      export default async function (c, next) {
        const user = c.get('user');
        if (!user || user.role !== 'admin') {
          return c.json({ detail: 'Forbidden' }, 403);
        }
        await next();
      }
    `);
    await writeModule('admin/items/get.js', `
      export default function () { return { items: [] }; }
    `);

    const app = createKozo();
    await app.loadRoutes(tmpDir);
    setupAuth(app, SECRET, { prefix: '' });

    const adminToken = await createJWT({ role: 'admin' }, SECRET, { expiresIn: '1h' });
    // JWT never reached before middleware — even valid admin token gets 403
    expect((await request(app, '/admin/items', adminToken)).status).toBe(403);
  });
});
