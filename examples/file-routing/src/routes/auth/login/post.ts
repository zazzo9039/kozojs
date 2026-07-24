import { z } from 'zod';
import { requireSecret } from '@kozojs/core';
import { createJWT } from '@kozojs/auth';
import { verifyPassword } from '../../../lib/password.js';
import type { AppServices } from '../../../services.js';

export const meta = { auth: false, tags: ['auth'] };

// Read once, at module load — so a missing JWT_SECRET fails the boot instead of
// the first login attempt.
const JWT_SECRET = requireSecret('JWT_SECRET');

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
  if (!user || !(await verifyPassword(ctx.body.password, user.password))) {
    return ctx.json({ detail: 'Invalid credentials' }, 401);
  }
  const token = await createJWT(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
  );
  return { token, user: { id: user.id, email: user.email, role: user.role } };
};
