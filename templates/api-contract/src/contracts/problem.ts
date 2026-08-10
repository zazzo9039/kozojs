import { z } from '@kozojs/core';

export const ProblemSchema = z.object({
  type: z.string(), title: z.string(), status: z.number().int(), detail: z.string(),
});

export const problem = (status: number, title: string, detail: string) => ({
  type: 'about:blank', title, status, detail,
});
