/**
 * Tests for transport-agnostic guards: jwtGuard, roleGuard, registerAuthGuard.
 * Guards are pure functions over GuardRequest — tested directly, no server.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jwtGuard, roleGuard, registerAuthGuard, createJWT } from '../src/index.js';
import type { GuardRequest, KozoGuard } from '../src/index.js';

const SECRET = 'test-secret-must-be-at-least-32-chars-long';

function makeReq(opts: {
  path?: string;
  headers?: Record<string, string>;
  user?: unknown;
}): GuardRequest {
  const headers = Object.fromEntries(
    Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    method: 'GET',
    path: opts.path ?? '/api/thing',
    url: opts.path ?? '/api/thing',
    params: {},
    user: opts.user ?? null,
    header: (n) => headers[n.toLowerCase()],
  };
}

function deny(r: unknown): { status: number; body?: any } | null {
  return (r as any)?.deny ?? null;
}

describe('jwtGuard', () => {
  it('denies 401 when no token', async () => {
    const g = jwtGuard(SECRET);
    const r = await g(makeReq({}));
    expect(deny(r)?.status).toBe(401);
    expect(deny(r)?.body.detail).toBe('Missing authentication token');
  });

  it('attaches the payload as user for a valid token', async () => {
    const token = await createJWT({ email: 'a@b.c', role: 'admin' }, SECRET);
    const g = jwtGuard(SECRET);
    const r = await g(makeReq({ headers: { Authorization: `Bearer ${token}` } }));
    expect(deny(r)).toBeNull();
    expect((r as any).user.email).toBe('a@b.c');
    expect((r as any).user.role).toBe('admin');
  });

  it('denies 401 for an invalid token', async () => {
    const g = jwtGuard(SECRET);
    const r = await g(makeReq({ headers: { Authorization: 'Bearer not-a-jwt' } }));
    expect(deny(r)?.status).toBe(401);
  });

  it('passes public paths without a token (exact and prefix)', async () => {
    const g = jwtGuard(SECRET, { publicPaths: ['/api/health', '/api/docs'] });
    expect(await g(makeReq({ path: '/api/health' }))).toBeUndefined();
    expect(await g(makeReq({ path: '/api/docs/swagger.json' }))).toBeUndefined();
    expect(deny(await g(makeReq({ path: '/api/users' })))?.status).toBe(401);
  });

  it('still rejects an invalid token on a public path (optional-decode parity)', async () => {
    const g = jwtGuard(SECRET, { publicPaths: ['/api/health'] });
    const r = await g(makeReq({ path: '/api/health', headers: { Authorization: 'Bearer bad' } }));
    expect(deny(r)?.status).toBe(401);
  });

  it('enforces expectedClaims', async () => {
    const token = await createJWT({ aud: 'other' }, SECRET);
    const g = jwtGuard(SECRET, { expectedClaims: { aud: 'mine' } });
    const r = await g(makeReq({ headers: { Authorization: `Bearer ${token}` } }));
    expect(deny(r)?.status).toBe(401);
    expect(deny(r)?.body.detail).toBe('Invalid claim: aud');
  });
});

describe('roleGuard', () => {
  it('denies 401 when unauthenticated', () => {
    const r = roleGuard('admin')(makeReq({}));
    expect(deny(r)?.status).toBe(401);
  });

  it('denies 403 for the wrong role', () => {
    const r = roleGuard('admin')(makeReq({ user: { role: 'user' } }));
    expect(deny(r)?.status).toBe(403);
  });

  it('passes a matching role (string and array)', () => {
    expect(roleGuard('admin')(makeReq({ user: { role: 'admin' } }))).toBeUndefined();
    expect(roleGuard(['editor', 'admin'])(makeReq({ user: { roles: ['editor'] } }))).toBeUndefined();
  });
});

describe('registerAuthGuard', () => {
  it('registers a single guard on `${prefix}/*` honoring extraPublicPaths', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'kozo-guards-'));
    try {
      const captured: { pattern: string; guard: KozoGuard }[] = [];
      const appLike = { guard: (pattern: string, guard: KozoGuard) => captured.push({ pattern, guard }) };

      await registerAuthGuard(appLike, SECRET, {
        routesDir: tmp,
        extraPublicPaths: ['/api/docs'],
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].pattern).toBe('/api/*');

      const g = captured[0].guard;
      expect(await g(makeReq({ path: '/api/docs' }))).toBeUndefined();
      expect(deny(await g(makeReq({ path: '/api/users' })))?.status).toBe(401);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
