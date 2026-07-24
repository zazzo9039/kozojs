import { randomBytes } from 'node:crypto';
import { buildApp } from '../src/app.js';

// This smoke check runs outside any deployment, so it mints a throwaway secret
// for the duration of the process. An application must never do this — it would
// invalidate every previously issued token on restart.
process.env.JWT_SECRET = randomBytes(48).toString('base64url');

const app = await buildApp();

const health = await app.fetch(new Request('http://localhost/health'));
console.assert(health.status === 200, 'health should be 200');

const login = await app.fetch(new Request('http://localhost/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
}));
const { token } = await login.json() as { token: string };
console.assert(login.status === 200 && token, 'login should return token');

const users = await app.fetch(new Request('http://localhost/api/users', {
  headers: { Authorization: `Bearer ${token}` },
}));
console.assert(users.status === 200, 'api/users should be 200');

const stats = await app.fetch(new Request('http://localhost/admin/stats', {
  headers: { Authorization: `Bearer ${token}` },
}));
console.assert(stats.status === 200, 'admin/stats should be 200');

console.log('file-routing smoke: OK');
