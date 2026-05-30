import { z } from 'zod';
import type { AppServices } from '../../services.js';

export const meta = { auth: false, tags: ['auth'] };

const RegisterSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
});

export const schema = {
  body: RegisterSchema,
  response: z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.string() }),
};

export default (ctx: { body: z.infer<typeof RegisterSchema>; services: AppServices }) => {
  if (ctx.services.users.findByEmail(ctx.body.email)) {
    return ctx.json({ detail: 'Email already registered' }, 409);
  }
  return ctx.services.users.create({ ...ctx.body, role: 'user' });
};
