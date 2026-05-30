import { createKozo } from '@kozojs/core';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export async function setupKozoRequest(): Promise<{ port: number; server: any }> {
  const app = createKozo({});
  const users: { id: string; name: string; email: string }[] = [];

  // GET /api/users - List all users
  app.get('/api/users', {
    response: z.array(UserSchema),
  }, () => users);

  // GET /api/users/:id - Get user by ID
  app.get('/api/users/:id', {
    params: z.object({ id: z.string() }),
    response: UserSchema,
  }, (c) => {
    const { id } = c.params;
    return { id, name: `User ${id}`, email: `user${id}@test.com` };
  });

  // POST /api/users - Create user
  app.post('/api/users', {
    body: CreateUserSchema,
    response: UserSchema,
  }, (c) => {
    const user = { id: Date.now().toString(), ...c.body };
    users.push(user);
    return user;
  });

  // Helper to clear state between runs
  (app as any)._clearUsers = () => { users.length = 0; };

  const { port, server } = await app.nativeListen(0);
  return { port, server };
}
