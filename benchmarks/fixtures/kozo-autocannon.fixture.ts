import { createKozo, NotFoundError } from '@kozojs/core';
import { z } from 'zod';

interface User {
  id: string;
  name: string;
  email: string;
}

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

export async function setupKozoAutocannon(): Promise<{ app: any; port: number; server: any }> {
  const app = createKozo({});
  const data: User[] = [];

  // GET /api/users - List all users
  app.get('/api/users', {
    response: z.array(UserSchema),
  }, () => data);

  // GET /api/users/:id - Get user by ID (uses RFC 7807 error)
  app.get('/api/users/:id', {
    params: z.object({ id: z.string() }),
    response: UserSchema,
  }, (c) => {
    const user = data.find(u => u.id === c.params.id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  });

  // POST /api/users - Create user
  app.post('/api/users', {
    body: CreateUserSchema,
    response: UserSchema,
  }, (c) => {
    const user = { id: Date.now().toString(), ...c.body };
    data.push(user);
    return user;
  });

  // GET /api/health - Health check
  app.get('/api/health', {}, () => ({
    status: 'ok',
    timestamp: Date.now(),
  }));

  const { port, server } = await app.nativeListen(0);
  return { app, port, server };
}
