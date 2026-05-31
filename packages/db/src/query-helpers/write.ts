import { eq, type SQL } from 'drizzle-orm';
import type { DeleteByIdResult, IdTable, ReturningOptions } from './types.js';
import { RowNotFoundError, rethrowConflict } from './errors.js';

function returningArgs(options?: ReturningOptions) {
  if (!options?.returning || options.returning === '*') return undefined;
  return options.returning;
}

/** Insert one row; returns the inserted row (via `.returning()`). */
export async function insertOne<TRow>(
  db: any,
  table: unknown,
  values: Record<string, unknown>,
  options?: ReturningOptions,
): Promise<TRow> {
  const returning = returningArgs(options);
  const builder = db.insert(table).values(values);
  const rows = returning
    ? await builder.returning(returning) as TRow[]
    : await builder.returning() as TRow[];
  return rows[0];
}

/** Insert multiple rows; returns all inserted rows. */
export async function insertMany<TRow>(
  db: any,
  table: unknown,
  values: Record<string, unknown>[],
  options?: ReturningOptions,
): Promise<TRow[]> {
  const returning = returningArgs(options);
  const builder = db.insert(table).values(values);
  return returning
    ? await builder.returning(returning) as TRow[]
    : await builder.returning() as TRow[];
}

/** Update rows matching `where`; returns first updated row or `undefined`. */
export async function updateOne<TRow>(
  db: any,
  table: unknown,
  set: Record<string, unknown>,
  where: SQL,
  options?: ReturningOptions,
): Promise<TRow | undefined> {
  const returning = returningArgs(options);
  const builder = db.update(table).set(set).where(where);
  const rows = returning
    ? await builder.returning(returning) as TRow[]
    : await builder.returning() as TRow[];
  return rows[0];
}

/** Update or throw {@link RowNotFoundError}. */
export async function updateOneOrThrow<TRow>(
  db: any,
  table: unknown,
  set: Record<string, unknown>,
  where: SQL,
  notFoundMessage: string,
  options?: ReturningOptions,
): Promise<TRow> {
  const row = await updateOne<TRow>(db, table, set, where, options);
  if (!row) throw new RowNotFoundError(notFoundMessage);
  return row;
}

/** Update by primary key `id`. */
export async function updateById<TRow>(
  db: any,
  table: IdTable,
  id: string | number,
  set: Record<string, unknown>,
  options?: ReturningOptions,
): Promise<TRow | undefined> {
  return updateOne<TRow>(db, table, set, eq(table.id, id), options);
}

/** Update by id or throw; maps unique violations to {@link RowConflictError}. */
export async function updateByIdOrThrow<TRow>(
  db: any,
  table: IdTable,
  id: string | number,
  set: Record<string, unknown>,
  notFoundMessage: string,
  conflictMessage = 'Conflict',
  options?: ReturningOptions,
): Promise<TRow> {
  try {
    const row = await updateById<TRow>(db, table, id, set, options);
    if (!row) throw new RowNotFoundError(notFoundMessage);
    return row;
  } catch (err) {
    if (err instanceof RowNotFoundError) throw err;
    rethrowConflict(err, conflictMessage);
  }
}

/** Delete rows matching `where`; returns first deleted row or `undefined`. */
export async function deleteOne(
  db: any,
  table: unknown,
  where: SQL,
  options?: ReturningOptions,
): Promise<unknown | undefined> {
  const returning = returningArgs(options);
  const builder = db.delete(table).where(where);
  const rows = returning
    ? await builder.returning(returning) as unknown[]
    : await builder.returning() as unknown[];
  return rows[0];
}

/** Delete or throw {@link RowNotFoundError}. */
export async function deleteOneOrThrow(
  db: any,
  table: unknown,
  where: SQL,
  notFoundMessage: string,
  options?: ReturningOptions,
): Promise<unknown> {
  const deleted = await deleteOne(db, table, where, options);
  if (!deleted) throw new RowNotFoundError(notFoundMessage);
  return deleted;
}

/** Delete by primary key `id`. */
export async function deleteById(
  db: any,
  table: IdTable,
  id: string | number,
  options?: ReturningOptions,
): Promise<unknown | undefined> {
  return deleteOne(db, table, eq(table.id, id), options);
}

/** Delete by id or throw; returns `{ success, deletedId, deleted }`. */
export async function deleteByIdOrThrow(
  db: any,
  table: IdTable,
  id: string | number,
  notFoundMessage: string,
  options?: ReturningOptions,
): Promise<DeleteByIdResult> {
  const deleted = await deleteOneOrThrow(db, table, eq(table.id, id), notFoundMessage, options);
  return { success: true, deletedId: String(id), deleted };
}

/** @deprecated Use {@link deleteByIdOrThrow}. */
export const deleteOneByIdOrThrow = deleteByIdOrThrow;

/** Delete all rows matching `where`; returns deleted rows. */
export async function deleteMany(
  db: any,
  table: unknown,
  where: SQL,
  options?: ReturningOptions,
): Promise<unknown[]> {
  const returning = returningArgs(options);
  const builder = db.delete(table).where(where);
  return returning
    ? await builder.returning(returning) as unknown[]
    : await builder.returning() as unknown[];
}

/**
 * Insert or update on conflict (Postgres/SQLite `ON CONFLICT DO UPDATE`).
 * Conflict target defaults to the table `id` column.
 */
export async function upsertOne<TRow>(
  db: any,
  table: IdTable,
  values: Record<string, unknown>,
  updateSet: Record<string, unknown>,
  options?: ReturningOptions,
): Promise<TRow> {
  const returning = returningArgs(options);
  const rows = await db.insert(table).values(values).onConflictDoUpdate({
    target: table.id,
    set: updateSet,
  }).returning(returning) as TRow[];
  return rows[0];
}
