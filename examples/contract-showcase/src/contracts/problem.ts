import { z } from '@kozojs/core';

export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
});

export function problem(status: number, title: string, detail: string) {
  return { type: 'about:blank', title, status, detail };
}
