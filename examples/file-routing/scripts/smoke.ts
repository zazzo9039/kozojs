import { buildApp } from '../src/app.js';

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
