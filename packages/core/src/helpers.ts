import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  assertStrongSecret,
  GENERATE_SECRET_COMMAND,
  MIN_SECRET_BYTES,
} from './weak-secrets.js';

// ============================================
// ENV VALIDATION
// ============================================

/**
 * Validate and parse environment variables at startup.
 * Throws a descriptive error if any variable is missing or invalid.
 *
 * @example
 * const env = defineEnv({
 *   PORT:         z.coerce.number().default(3000),
 *   DATABASE_URL: z.string().url(),
 *   JWT_SECRET:   z.string().min(32),
 * });
 * // env.PORT           → number
 * // env.DATABASE_URL   → string
 * app.listen(env.PORT);
 */
export function defineEnv<T extends z.ZodRawShape>(shape: T): z.infer<z.ZodObject<T>> {
  const schema = z.object(shape);
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[Kozo] Invalid environment variables:\n${errors}`);
  }
  return result.data;
}

/** Options for {@link requireSecret}. */
export interface RequireSecretOptions {
  /**
   * Minimum accepted length in bytes. Defaults to 32 — the SHA-256 output size,
   * past which an HMAC-SHA256 key gains no further strength.
   */
  minBytes?: number;
}

/**
 * Read a signing secret from the environment, or refuse to start.
 *
 * Unlike reading the variable directly and defaulting to a literal, this has no
 * fallback: a missing, too-short or publicly-known secret throws here, at
 * startup, instead of silently signing tokens with a value an attacker has too.
 *
 * Throws when the variable is unset, empty, shorter than `minBytes`, or equal
 * to one of the secrets Kozo has itself published (see `KNOWN_WEAK_SECRETS`).
 * Unlike the `@kozojs/auth` guards, which only warn about a short secret outside
 * production, this is strict on every `NODE_ENV` — you asked for a secret.
 *
 * @example
 * import { requireSecret } from '@kozojs/core';
 * const secret = requireSecret('JWT_SECRET');
 * app.guard('/api/*', jwtGuard(secret));
 */
export function requireSecret(name: string, options: RequireSecretOptions = {}): string {
  const { minBytes = MIN_SECRET_BYTES } = options;
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(
      `[Kozo] Missing required environment variable: ${name}\n` +
        `  It must be at least ${minBytes} bytes and must not be shared or committed.\n` +
        `  Generate one:  ${GENERATE_SECRET_COMMAND}`,
    );
  }

  assertStrongSecret(value, { source: name, minBytes, onShort: 'throw' });
  return value;
}

// ============================================
// PAGINATION
// ============================================

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Slice an in-memory array into a paginated result.
 * Pairs naturally with `paginationSchema` for the query params.
 *
 * @example
 * app.get('/users', { query: paginationSchema }, (ctx) => {
 *   return paginate(users, ctx.query.page, ctx.query.limit);
 * });
 */
export function paginate<T>(items: T[], page: number, limit: number): PaginatedResult<T> {
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit),
    hasNext: start + limit < items.length,
    hasPrev: page > 1,
  };
}

// ============================================
// UUID GENERATION
// ============================================

/**
 * Generate a RFC 4122 v4 UUID.
 * Uses Node.js `crypto.randomUUID()` — cryptographically secure, zero dependencies.
 *
 * @example
 * import { uuid } from '@kozojs/core';
 * const id = uuid(); // '550e8400-e29b-41d4-a716-446655440000'
 */
export function uuid(): string {
  return randomUUID();
}

/**
 * Common pagination query schema.
 * Use it directly as the `query` field to avoid repeating this pattern everywhere.
 *
 * @example
 * app.get('/users', { query: paginationSchema }, (ctx) => {
 *   const { page, limit } = ctx.query; // fully typed
 * });
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * Route param schema for `:id` routes that expect a UUID.
 *
 * @example
 * app.get('/users/:id', { params: uuidParams }, (ctx) => ctx.params.id);
 */
export const uuidParams = z.object({
  id: z.string().uuid(),
});

/**
 * Route param schema for `:id` routes that expect a positive integer.
 *
 * @example
 * app.get('/posts/:id', { params: idParams }, (ctx) => ctx.params.id);
 */
export const idParams = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Timestamps schema — extends any entity schema with createdAt/updatedAt.
 *
 * @example
 * const UserSchema = z.object({ name: z.string() }).merge(timestamps);
 * // or use .extend: z.object({ ... }).extend(timestamps.shape)
 */
export const timestamps = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Common sort query params.
 *
 * @example
 * app.get('/users', { query: paginationSchema.merge(sortSchema) }, handler);
 */
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

/**
 * Search query param (text search).
 *
 * @example
 * app.get('/products', { query: paginationSchema.merge(searchSchema) }, handler);
 */
export const searchSchema = z.object({
  q: z.string().optional(),
});

/**
 * Generic success response schema.
 *
 * @example
 * app.post('/confirm', { response: successSchema }, handler);
 */
export const successSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

/**
 * Standard success/deleted response schema.
 *
 * @example
 * app.delete('/users/:id', { params: uuidParams, response: deletedSchema }, ...);
 */
export const deletedSchema = z.object({
  success: z.boolean(),
  deletedId: z.string(),
});
