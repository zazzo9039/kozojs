import { z } from 'zod';
import type { AppServices } from '../../../services.js';

export const meta = { tags: ['users'] };

export const schema = {
  params: z.object({ id: z.string().min(1) }),
  response: z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.string() }),
};

export default (ctx: { params: { id: string }; services: AppServices }) => {
  const user = ctx.services.users.findById(ctx.params.id);
  if (!user) return ctx.json({ detail: 'User not found' }, 404);
  return user;
};
