import { z } from '@kozojs/core';

const EnvironmentSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
});

const environment = EnvironmentSchema.parse(process.env);
export const config = Object.freeze({ port: environment.PORT });
