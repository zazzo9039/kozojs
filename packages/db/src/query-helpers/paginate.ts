import { and, count, gt, type SQL } from 'drizzle-orm';
import type {
  CursorPaginatedQuery,
  CursorPaginatedResult,
  IdTable,
  PaginatedQuery,
  PaginatedResult,
  SelectOptions,
} from './types.js';
import { findMany } from './read.js';

/**
 * Offset pagination with parallel count query.
 *
 * @example
 * return paginateTable(db, users, ctx.query, { columns: publicColumns, orderBy: desc(users.createdAt) });
 */
export async function paginateTable<TRow>(
  db: any,
  table: unknown,
  query: PaginatedQuery,
  options?: Omit<SelectOptions, 'limit' | 'offset'>,
): Promise<PaginatedResult<TRow>> {
  const { page, limit } = query;
  const offset = (page - 1) * limit;
  const { where, columns, orderBy } = options ?? {};

  const rowsQuery = columns
    ? db.select(columns).from(table)
    : db.select().from(table);

  const countQuery = db.select({ value: count() }).from(table);

  let filteredRows = where ? rowsQuery.where(where) : rowsQuery;
  if (orderBy) {
    const cols = Array.isArray(orderBy) ? orderBy : [orderBy];
    filteredRows = filteredRows.orderBy(...cols);
  }

  const [rows, countRows] = await Promise.all([
    filteredRows.limit(limit).offset(offset),
    where ? countQuery.where(where) : countQuery,
  ]);

  const total = (countRows as [{ value: number }])[0].value;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data: rows as TRow[],
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Cursor pagination (keyset) — stable for infinite scroll; uses `id > cursor`.
 */
export async function paginateCursor<TRow, TCursor extends string | number = string | number>(
  db: any,
  table: IdTable,
  query: CursorPaginatedQuery,
  options?: Omit<SelectOptions, 'limit' | 'offset' | 'orderBy'>,
): Promise<CursorPaginatedResult<TRow, TCursor>> {
  const whereParts: SQL[] = [];
  if (options?.where) whereParts.push(options.where);
  if (query.cursor != null) whereParts.push(gt(table.id, query.cursor) as SQL);

  const combinedWhere = whereParts.length === 1
    ? whereParts[0]
    : whereParts.length > 1
      ? and(...whereParts)
      : undefined;

  const rows = await findMany<TRow & { id: TCursor }>(db, table, {
    ...options,
    where: combinedWhere,
    limit: query.limit + 1,
  });

  const hasNext = rows.length > query.limit;
  const data = hasNext ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasNext ? data[data.length - 1]?.id ?? null : null;

  return { data, nextCursor, hasNext };
}
