// H6 / F-19 — end-to-end login against the booted app. Unlike login.test.ts
// (which calls the handler directly), this drives a real HTTP request through
// the full pipeline built by buildApp(): file-system routing, the JWT
// middleware, body-schema validation, then the handler — verifying the hashed
// demo credentials the same way a client would. Runs under this example's
// `vitest run`.

import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';

type App = { fetch: (req: Request) => Response | Promise<Response> };

// Build the app once: route scanning + the scrypt-hashed demo seed are paid a
// single time rather than per test. The generous hook timeout absorbs slower CI
// runners (file-system route scanning under vitest is not fast). buildApp() runs
// requireSecret('JWT_SECRET'), so the secret is set first — generated per run,
// never committed.
let app: App;
beforeAll(async () => {
  process.env.JWT_SECRET = randomBytes(48).toString('base64url');
  const { buildApp } = await import('./app.js');
  app = (await buildApp()) as App;
}, 30_000);

function post(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('login end to end (booted app, real HTTP request)', () => {
  it('POST /auth/login with the correct password returns a JWT', async () => {
    const res = await post('/auth/login', { email: 'admin@example.com', password: 'admin123' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { email: string; role: string } };
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.')).toHaveLength(3); // header.payload.signature
    expect(body.user.email).toBe('admin@example.com');
    expect(body.user.role).toBe('admin');
  });

  it('POST /auth/login with a wrong password returns 401', async () => {
    const res = await post('/auth/login', { email: 'admin@example.com', password: 'not-the-password' });
    expect(res.status).toBe(401);
  });

  it('registered users can log in with the password they signed up with', async () => {
    const email = `new-${Date.now()}@example.com`;
    const register = await post('/auth/register', { name: 'New User', email, password: 'freshpw123' });
    expect(register.status).toBe(200);

    const ok = await post('/auth/login', { email, password: 'freshpw123' });
    expect(ok.status).toBe(200);

    const bad = await post('/auth/login', { email, password: 'freshpw123-wrong' });
    expect(bad.status).toBe(401);
  });
});
