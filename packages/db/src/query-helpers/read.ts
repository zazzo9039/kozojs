import { count, eq, gt, type SQL } from 'drizzle-orm';
import type { IdTable, SelectOptions } from './types.js';
import { RowNotFoundError } from './errors.js';

function applyOrderBy(q: any, orderBy?: unknown | unknown[]) {
  if (!orderBy) return q;
  const cols = Array.isArray(orderBy) ? orderBy : [orderBy];
  return q.orderBy(...cols);
}

function buildSelect(db: any, table: unknown, options?: SelectOptions) {
  let q = options?.columns
    ? db.select(options.columns).from(table)
    : db.select().from(table);

  if (options?.where) q = q.where(options.where);
  q = applyOrderBy(q, options?.orderBy);
  return q;
}

async function runSelect<TRow>(q: any, options?: SelectOptions): Promise<TRow[]> {
  if (options?.limit != null && options.offset != null) {
    return await q.limit(options.limit).offset(options.offset) as TRow[];
  }
  if (options?.limit != null) {
    return await q.limit(options.limit) as TRow[];
  }
  return await q as TRow[];
}

/** Returns all matching rows (optional filter, sort, limit, offset, column projection). */
export async function findMany<TRow>(
  db: any,
  table: unknown,
  options?: SelectOptions,
): Promise<TRow[]> {
  const q = buildSelect(db, table, options);
  return runSelect<TRow>(q, options);
}

/** Returns the first matching row, or `undefined`. */
export async function findOne<TRow>(
  db: any,
  table: unknown,
  where: SQL,
  options?: Omit<SelectOptions, 'where'>,
): Promise<TRow | undefined> {
  const rows = await findMany<TRow>(db, table, { ...options, where, limit: 1 });
  return rows[0];
}

/** Alias for {@link findOne}. */
export const findFirst = findOne;

/** Returns the first matching row or throws {@link RowNotFoundError}. */
export async function findOneOrThrow<TRow>(
  db: any,
  table: unknown,
  where: SQL,
  notFoundMessage: string,
  options?: Omit<SelectOptions, 'where'>,
): Promise<TRow> {
  const row = await findOne<TRow>(db, table, where, options);
  if (!row) throw new RowNotFoundError(notFoundMessage);
  return row;
}

/** Find by primary key `id`. */
export async function findById<TRow>(
  db: any,
  table: IdTable,
  id: string | number,
  options?: Omit<SelectOptions, 'where'>,
): Promise<TRow | undefined> {
  return findOne<TRow>(db, table, eq(table.id, id), options);
}

/** Find by primary key or throw {@link RowNotFoundError}. */
export async function findByIdOrThrow<TRow>(
  db: any,
  table: IdTable,
  id: string | number,
  notFoundMessage: string,
  options?: Omit<SelectOptions, 'where'>,
): Promise<TRow> {
  return findOneOrThrow<TRow>(db, table, eq(table.id, id), notFoundMessage, options);
}

/** Returns `true` when at least one row matches. */
export async function exists(
  db: any,
  table: unknown,
  where?: SQL,
): Promise<boolean> {
  const q = where
    ? db.select({ value: count() }).from(table).where(where)
    : db.select({ value: count() }).from(table);
  const [{ value }] = await q as [{ value: number }];
  return value > 0;
}

/** Count rows in a table, optionally filtered. */
export async function countRows(
  db: any,
  table: unknown,
  where?: SQL,
): Promise<number> {
  const q = where
    ? db.select({ value: count() }).from(table).where(where)
    : db.select({ value: count() }).from(table);
  const [{ value }] = await q as [{ value: number }];
  return value;
}

/** Count rows matching a `where` clause — alias for filtered {@link countRows}. */
export async function countWhere(
  db: any,
  table: unknown,
  where: SQL,
): Promise<number> {
  return countRows(db, table, where);
}

/** Fetch rows after a cursor value (`id > cursor`). */
export async function findManyAfterCursor<TRow>(
  db: any,
  table: IdTable,
  query: { limit: number; cursor?: string | number | null },
  options?: Omit<SelectOptions, 'limit' | 'offset' | 'where'>,
): Promise<TRow[]> {
  const where = query.cursor != null ? gt(table.id, query.cursor) : undefined;
  return findMany<TRow>(db, table, {
    ...options,
    where,
    limit: query.limit + 1,
  });
}
