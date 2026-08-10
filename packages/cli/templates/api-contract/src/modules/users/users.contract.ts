import { z } from '@kozojs/core';
import { ProblemSchema } from '../../contracts/problem.js';

export const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.email() });
export const CreateUserSchema = z.object({ name: z.string().min(1), email: z.email() });
export const UserIdParamsSchema = z.object({ id: z.string().min(1) });
export const UserListSchema = z.object({ items: z.array(UserSchema) });
export const UserResponses = {
  list: { 200: UserListSchema },
  created: { 201: UserSchema },
  detail: { 200: UserSchema, 404: ProblemSchema },
} as const;
