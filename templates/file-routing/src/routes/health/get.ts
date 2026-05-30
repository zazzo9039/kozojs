import { z } from 'zod';

export const meta = { auth: false, tags: ['health'] };

export const schema = {
  response: z.object({
    status: z.string(),
    timestamp: z.string(),
    uptime: z.number(),
  }),
};

export default () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
});
