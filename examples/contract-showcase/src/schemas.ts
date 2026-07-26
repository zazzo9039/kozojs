import { z } from '@kozojs/core';

export const ErrorSchema = z.object({
  message: z.string(),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  active: z.boolean(),
  tags: z.array(z.string()),
});

export const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
  active: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
});

export const UserIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const UserQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  active: z.enum(['true', 'false']).optional(),
  tag: z.union([z.string(), z.array(z.string())]).optional(),
});

export const UserListSchema = z.object({
  items: z.array(UserSchema),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  ownerId: z.string().min(1),
});

export const ProjectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const AuthorizationHeadersSchema = z.object({
  authorization: z.string().startsWith('Bearer '),
});

export const AdminStatsSchema = z.object({
  users: z.number().int().nonnegative(),
  projects: z.number().int().nonnegative(),
});
