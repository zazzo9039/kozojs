/** Drizzle client — intentionally loose for cross-dialect compatibility. */
export type DbClient = any;

/** Table with a primary `id` column — used by *ById helpers. */
export type IdTable = { id: Parameters<typeof import('drizzle-orm').eq>[0] };

/** Page/limit pair — pairs with `paginationSchema` from `@kozojs/core`. */
export interface PaginatedQuery {
  page: number;
  limit: number;
}

/** Standard offset paginated list (matches `@kozojs/core` `PaginatedResult`). */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Cursor-based pagination query. */
export interface CursorPaginatedQuery {
  limit: number;
  /** Return rows after this cursor value (exclusive). */
  cursor?: string | number | null;
}

/** Cursor paginated list — stable for infinite scroll feeds. */
export interface CursorPaginatedResult<T, TCursor = string | number> {
  data: T[];
  nextCursor: TCursor | null;
  hasNext: boolean;
}

/** Shared read/list options for select helpers. */
export interface SelectOptions {
  where?: import('drizzle-orm').SQL;
  columns?: Record<string, unknown>;
  orderBy?: unknown | unknown[];
  limit?: number;
  offset?: number;
}

/** Options for write helpers that return rows. */
export interface ReturningOptions {
  returning?: Record<string, unknown> | '*';
}

/** Standard delete-by-id response shape. */
export interface DeleteByIdResult {
  success: true;
  deletedId: string;
  deleted: unknown;
}
