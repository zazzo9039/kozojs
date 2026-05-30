import { z } from 'zod';
import type { KozoContext } from '@kozojs/core';

export const schema = {
  body: z.object({
    message: z.string().min(1),
  }),
};

export default async (ctx: KozoContext<typeof schema>) => {
  const jobId = await ctx.services.jobQueue.add('notify', { message: ctx.body.message });
  return { queued: true, jobId };
};
