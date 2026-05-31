/** Thrown when a expected row is not found (maps to HTTP 404 in app layer). */
export class RowNotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'RowNotFoundError';
  }
}

/** Thrown on unique constraint violations (maps to HTTP 409 in app layer). */
export class RowConflictError extends Error {
  readonly code = '23505';
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'RowConflictError';
  }
}

/** Detect Postgres/SQLite unique constraint errors from Drizzle/driver. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/** Re-throw as {@link RowConflictError} on unique violations; otherwise re-throws. */
export function rethrowConflict(err: unknown, message = 'Conflict'): never {
  if (isUniqueViolation(err)) throw new RowConflictError(message);
  throw err;
}
