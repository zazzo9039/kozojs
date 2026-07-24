// H6 / F-19 — the login route verifies a hashed password end to end: the demo
// users are seeded through hashPassword (services.ts), and login checks them
// with verifyPassword. This exercises the whole path against the real store and
// a real JWT. Runs as part of this example's `vitest run`.

import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';

// requireSecret('JWT_SECRET') runs when the login route module loads, so set a
// strong secret before importing it. Generated per run — never committed.
beforeAll(() => {
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
});

type LoginResult = { token?: string; user?: { email: string }; status?: number };

async function callLogin(email: string, password: string): Promise<LoginResult> {
  const { userStore } = await import('../../services.js');
  const login = (await import('./login/post.js')).default;
  const json = (body: unknown, status?: number) => ({ ...(body as object), status });
  return login({
    body: { email, password },
    services: { users: userStore },
    json,
  } as never) as Promise<LoginResult>;
}

describe('login route with hashed passwords', () => {
  it('accepts the correct demo password and returns a JWT', async () => {
    const res = await callLogin('admin@example.com', 'admin123');
    expect(res.status).toBeUndefined(); // not an error response
    expect(typeof res.token).toBe('string');
    expect(res.user?.email).toBe('admin@example.com');
  });

  it('rejects a wrong password with 401 (no plaintext comparison)', async () => {
    const res = await callLogin('admin@example.com', 'not-the-password');
    expect(res.status).toBe(401);
    expect(res.token).toBeUndefined();
  });

  it('rejects an unknown email with 401', async () => {
    const res = await callLogin('nobody@example.com', 'admin123');
    expect(res.status).toBe(401);
  });
});
