import { z } from 'zod';
import type { AppServices } from '../../services.js';

export const meta = { tags: ['users'] };

export const schema = {
  response: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.string() })),
};

export default (ctx: { services: AppServices }) => ctx.services.users.findAll();
