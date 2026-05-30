import { z } from 'zod';
import type { AppServices } from '../../services.js';

export const meta = { tags: ['admin'] };

export const schema = {
  response: z.object({ users: z.number(), timestamp: z.string() }),
};

export default (ctx: { services: AppServices }) => ({
  users: ctx.services.users.count(),
  timestamp: new Date().toISOString(),
});
