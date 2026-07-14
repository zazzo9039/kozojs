import { NotFoundError, ConflictError } from '@kozojs/core';

/** Thrown when an expected row is not found — maps to HTTP 404 via {@link NotFoundError}. */
export class RowNotFoundError extends NotFoundError {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'RowNotFoundError';
  }
}

/** Thrown on unique constraint violations — maps to HTTP 409 via {@link ConflictError}. */
export class RowConflictError extends ConflictError {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'RowConflictError';
  }
}

/** Detect Postgres/SQLite/MySQL unique constraint errors from Drizzle/driver. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'ER_DUP_ENTRY';
}

/** Re-throw as {@link RowConflictError} on unique violations; otherwise re-throws. */
export function rethrowConflict(err: unknown, message = 'Conflict'): never {
  if (isUniqueViolation(err)) throw new RowConflictError(message);
  throw err;
}
