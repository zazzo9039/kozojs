import build from 'fast-json-stringify';
import { z } from 'zod';
import { zodToJsonSchema } from './json-schema.js';
import type { RouteSchema } from './types.js';

/**
 * Response serialization strategy (chosen once at route registration):
 *
 * - **fast-json-stringify** — `z.toJSONSchema` + fjs compile succeeded. Enforces the
 *   declared response shape: properties not in the schema are **omitted** (Zod v4 emits
 *   `additionalProperties: false`). This is intentional contract enforcement, not a bug.
 * - **json-stringify** — fallback via `toJsonBody` when:
 *   - response schema is `z.any()`
 *   - `z.toJSONSchema` throws (e.g. `.transform()`, `z.date()`, other non-JSON-schema types)
 *   - `fast-json-stringify` compile throws
 *
 * Handlers return **output** data; response schemas should describe that output. Transforms
 * on response schemas are unsupported for fjs and correctly fall back (no silent wrong compile).
 *
 * Compile is **eager**: `SchemaCompiler.compile()` at `app.get/post/...` registration —
 * never on first request. Each route holds its own compiled function (no cross-route cache).
 */

export type ResponseSerializerMode = 'fast-json-stringify' | 'json-stringify';

export interface CompiledResponseSerializer {
  serialize: (data: unknown) => string;
  mode: ResponseSerializerMode;
  /**
   * Present only when the schema was meant to be enforced but **could not be
   * compiled** (z.toJSONSchema / fast-json-stringify threw), so the serializer
   * silently fell back to unfiltered `JSON.stringify`. The response contract is
   * NOT a whitelist for such a route: undeclared fields are sent verbatim.
   *
   * This flag exists so the caller can react — warn in development, refuse to
   * start in production (see `SchemaCompiler.compile`). It is deliberately
   * **absent** for a `z.any()` response, where unfiltered serialization is the
   * author's explicit choice rather than a compile failure.
   */
  unsafeFallback?: { reason: string };
}

function dateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Fallback when fjs is not used (see module doc above). */
export function toJsonBody(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result, dateReplacer);
}

function isZodSchema(schema: unknown): schema is z.ZodType {
  return typeof schema === 'object' && schema !== null && 'safeParse' in schema;
}

export function resolveResponseZodSchema(
  response: RouteSchema['response'],
): z.ZodType | undefined {
  if (!response) return undefined;
  if (isZodSchema(response)) return response;
  const record = response as Record<number, z.ZodType>;
  return record[200] ?? record['200' as unknown as number] ?? Object.values(record)[0];
}

export function compileResponseSerializerWithMeta(
  response: RouteSchema['response'],
): CompiledResponseSerializer | undefined {
  const zodSchema = resolveResponseZodSchema(response);
  if (!zodSchema) return undefined;

  if (zodSchema instanceof z.ZodAny) {
    return { serialize: toJsonBody, mode: 'json-stringify' };
  }

  try {
    const jsonSchema = zodToJsonSchema(zodSchema);
    const stringify = build(jsonSchema as unknown as Parameters<typeof build>[0]);
    return {
      mode: 'fast-json-stringify',
      serialize: (data: unknown) => {
        if (typeof data === 'string') return data;
        return stringify(data);
      },
    };
  } catch (err) {
    // Involuntary fallback: the schema was meant to enforce the response but
    // could not be compiled. Report the cause so the caller can decide whether
    // shipping an unenforced response is acceptable (dev) or fatal (prod).
    return {
      serialize: toJsonBody,
      mode: 'json-stringify',
      unsafeFallback: { reason: (err as Error)?.message ?? String(err) },
    };
  }
}

export function compileResponseSerializer(
  response: RouteSchema['response'],
): ((data: unknown) => string) | undefined {
  return compileResponseSerializerWithMeta(response)?.serialize;
}

/** Test helper: legacy path before fjs (JSON.stringify + Date → ISO). */
export function legacyJsonBody(result: unknown): string {
  return toJsonBody(result);
}
