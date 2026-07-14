import { z } from 'zod';

export type JsonSchemaObject = Record<string, unknown>;

/** Zod v4 native JSON Schema export — shared by OpenAPI and response serialization. */
export function zodToJsonSchema(zodSchema: z.ZodType): JsonSchemaObject {
  const { $schema, ...rest } = z.toJSONSchema(zodSchema) as Record<string, unknown>;
  return rest;
}
