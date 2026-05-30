/** In-memory user store — swap for @kozojs/db in production. */

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  password: string;
}

const users = new Map<string, User>([
  ['1', { id: '1', name: 'Alice Admin', email: 'admin@example.com', role: 'admin', password: 'admin123' }],
  ['2', { id: '2', name: 'Bob User', email: 'bob@example.com', role: 'user', password: 'user123' }],
]);

export const userStore = {
  findAll: () => [...users.values()].map(({ password: _, ...u }) => u),
  findById: (id: string) => {
    const u = users.get(id);
    if (!u) return null;
    const { password: _, ...safe } = u;
    return safe;
  },
  findByEmail: (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
  create: (data: Omit<User, 'id'>) => {
    const id = crypto.randomUUID();
    const user: User = { id, ...data };
    users.set(id, user);
    const { password: _, ...safe } = user;
    return safe;
  },
  count: () => users.size,
};

export type AppServices = { users: typeof userStore };
