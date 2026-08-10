import { z } from '@kozojs/core';
import { ProblemSchema } from '../../contracts/problem.js';

export const AuthorizationHeadersSchema = z.object({ authorization: z.string().startsWith('Bearer ') });
export const AdminStatsSchema = z.object({
  users: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
});
export const AdminResponses = { stats: { 200: AdminStatsSchema, 401: ProblemSchema } } as const;
