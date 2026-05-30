import { z } from 'zod';
import { createJWT } from '@kozojs/auth';
import type { AppServices } from '../../services.js';

export const meta = { auth: false, tags: ['auth'] };

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const schema = {
  body: LoginSchema,
  response: z.object({ token: z.string(), user: z.object({ id: z.string(), email: z.string(), role: z.string() }) }),
};

export default async (ctx: { body: z.infer<typeof LoginSchema>; services: AppServices }) => {
  const user = ctx.services.users.findByEmail(ctx.body.email);
  if (!user || user.password !== ctx.body.password) {
    return ctx.json({ detail: 'Invalid credentials' }, 401);
  }
  const token = await createJWT(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET ?? 'dev-secret-must-be-at-least-32-characters-long',
  );
  return { token, user: { id: user.id, email: user.email, role: user.role } };
};
