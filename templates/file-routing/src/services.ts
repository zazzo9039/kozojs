/** In-memory user store — swap for @kozojs/db in production. */

import { hashPassword } from './lib/password.js';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  /** Stored as a scrypt hash (see ./lib/password.ts), never as plaintext. */
  password: string;
}

// Demo accounts. The passwords below are the ones you log in with — they are
// hashed through the same path as registration before being stored, so nothing
// here is a plaintext or pasted-hash literal. Top-level await runs once at
// startup, before the first request.
const seed = [
  { id: '1', name: 'Alice Admin', email: 'admin@example.com', role: 'admin' as const, password: 'admin123' },
  { id: '2', name: 'Bob User', email: 'bob@example.com', role: 'user' as const, password: 'user123' },
];

const users = new Map<string, User>();
for (const u of seed) {
  users.set(u.id, { ...u, password: await hashPassword(u.password) });
}

export const userStore = {
  findAll: () => [...users.values()].map(({ password: _, ...u }) => u),
  findById: (id: string) => {
    const u = users.get(id);
    if (!u) return null;
    const { password: _, ...safe } = u;
    return safe;
  },
  findByEmail: (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
  create: async (data: Omit<User, 'id'>) => {
    const id = crypto.randomUUID();
    const user: User = { id, ...data, password: await hashPassword(data.password) };
    users.set(id, user);
    const { password: _, ...safe } = user;
    return safe;
  },
  count: () => users.size,
};

export type AppServices = { users: typeof userStore };
