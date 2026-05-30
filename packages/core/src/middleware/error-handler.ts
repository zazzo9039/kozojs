import type { Context, Next } from 'hono';
import { KozoError } from '../errors.js';

/**
 * Global error handler middleware.
 * Catches KozoError instances and returns RFC 7807 problem+json responses.
 */
export function errorHandler() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof KozoError) {
        return err.toResponse(c.req.path);
      }

      // Unknown error
      console.error('Unhandled error:', err);
      return c.json({
        error: 'Internal Server Error',
        status: 500
      }, 500);
    }
  };
}
