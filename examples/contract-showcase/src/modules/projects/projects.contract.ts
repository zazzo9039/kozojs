import { z } from '@kozojs/core';
import { ProblemSchema } from '../../contracts/problem.js';

export const ProjectSchema = z.object({ id: z.string(), name: z.string(), ownerId: z.string() });
export const CreateProjectSchema = z.object({ name: z.string().min(1), ownerId: z.string().min(1) });
export const ProjectIdParamsSchema = z.object({ id: z.string().min(1) });
export const ProjectResponses = {
  created: { 201: ProjectSchema },
  detail: { 200: ProjectSchema, 404: ProblemSchema },
} as const;
