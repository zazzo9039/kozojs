import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as drizzle_orm from 'drizzle-orm';
import { SQL } from 'drizzle-orm';
export { SQL, and, asc, avg, between, count, desc, eq, getTableColumns, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, max, min, ne, not, notBetween, notInArray, notLike, or, sql, sum } from 'drizzle-orm';
export { createInsertSchema, createSchemaFactory, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { NotFoundError, ConflictError } from '@kozojs/core';

/** Drizzle client — intentionally loose for cross-dialect compatibility. */
type DbClient = any;
/** Table with a primary `id` column — used by *ById helpers. */
type IdTable = {
    id: Parameters<typeof drizzle_orm.eq>[0];
};
/** Page/limit pair — pairs with `paginationSchema` from `@kozojs/core`. */
interface PaginatedQuery {
    page: number;
    limit: number;
}
/** Standard offset paginated list (matches `@kozojs/core` `PaginatedResult`). */
interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}
/** Cursor-based pagination query. */
interface CursorPaginatedQuery {
    limit: number;
    /** Return rows after this cursor value (exclusive). */
    cursor?: string | number | null;
}
/** Cursor paginated list — stable for infinite scroll feeds. */
interface CursorPaginatedResult<T, TCursor = string | number> {
    data: T[];
    nextCursor: TCursor | null;
    hasNext: boolean;
}
/** Shared read/list options for select helpers. */
interface SelectOptions {
    where?: drizzle_orm.SQL;
    columns?: Record<string, unknown>;
    orderBy?: unknown | unknown[];
    limit?: number;
    offset?: number;
}
/** Options for write helpers that return rows. */
interface ReturningOptions {
    returning?: Record<string, unknown> | '*';
}
/** Standard delete-by-id response shape. */
interface DeleteByIdResult {
    success: true;
    deletedId: string;
    deleted: unknown;
}

/** Thrown when an expected row is not found — maps to HTTP 404 via {@link NotFoundError}. */
declare class RowNotFoundError extends NotFoundError {
    constructor(message?: string);
}
/** Thrown on unique constraint violations — maps to HTTP 409 via {@link ConflictError}. */
declare class RowConflictError extends ConflictError {
    constructor(message?: string);
}
/** Detect Postgres/SQLite/MySQL unique constraint errors from Drizzle/driver. */
declare function isUniqueViolation(err: unknown): boolean;
/** Re-throw as {@link RowConflictError} on unique violations; otherwise re-throws. */
declare function rethrowConflict(err: unknown, message?: string): never;

/** Returns all matching rows (optional filter, sort, limit, offset, column projection). */
declare function findMany<TRow>(db: any, table: unknown, options?: SelectOptions): Promise<TRow[]>;
/** Returns the first matching row, or `undefined`. */
declare function findOne<TRow>(db: any, table: unknown, where: SQL, options?: Omit<SelectOptions, 'where'>): Promise<TRow | undefined>;
/** Alias for {@link findOne}. */
declare const findFirst: typeof findOne;
/** Returns the first matching row or throws {@link RowNotFoundError}. */
declare function findOneOrThrow<TRow>(db: any, table: unknown, where: SQL, notFoundMessage: string, options?: Omit<SelectOptions, 'where'>): Promise<TRow>;
/** Find by primary key `id`. */
declare function findById<TRow>(db: any, table: IdTable, id: string | number, options?: Omit<SelectOptions, 'where'>): Promise<TRow | undefined>;
/** Find by primary key or throw {@link RowNotFoundError}. */
declare function findByIdOrThrow<TRow>(db: any, table: IdTable, id: string | number, notFoundMessage: string, options?: Omit<SelectOptions, 'where'>): Promise<TRow>;
/** Returns `true` when at least one row matches. */
declare function exists(db: any, table: unknown, where?: SQL): Promise<boolean>;
/** Count rows in a table, optionally filtered. */
declare function countRows(db: any, table: unknown, where?: SQL): Promise<number>;
/** Count rows matching a `where` clause — alias for filtered {@link countRows}. */
declare function countWhere(db: any, table: unknown, where: SQL): Promise<number>;
/** Fetch rows after a cursor value (`id > cursor`). */
declare function findManyAfterCursor<TRow>(db: any, table: IdTable, query: {
    limit: number;
    cursor?: string | number | null;
}, options?: Omit<SelectOptions, 'limit' | 'offset' | 'where'>): Promise<TRow[]>;

/** Insert one row; returns the inserted row (via `.returning()`). */
declare function insertOne<TRow>(db: any, table: unknown, values: Record<string, unknown>, options?: ReturningOptions): Promise<TRow>;
/** Insert multiple rows; returns all inserted rows. */
declare function insertMany<TRow>(db: any, table: unknown, values: Record<string, unknown>[], options?: ReturningOptions): Promise<TRow[]>;
/** Update rows matching `where`; returns first updated row or `undefined`. */
declare function updateOne<TRow>(db: any, table: unknown, set: Record<string, unknown>, where: SQL, options?: ReturningOptions): Promise<TRow | undefined>;
/** Update or throw {@link RowNotFoundError}. */
declare function updateOneOrThrow<TRow>(db: any, table: unknown, set: Record<string, unknown>, where: SQL, notFoundMessage: string, options?: ReturningOptions): Promise<TRow>;
/** Update by primary key `id`. */
declare function updateById<TRow>(db: any, table: IdTable, id: string | number, set: Record<string, unknown>, options?: ReturningOptions): Promise<TRow | undefined>;
/** Update by id or throw; maps unique violations to {@link RowConflictError}. */
declare function updateByIdOrThrow<TRow>(db: any, table: IdTable, id: string | number, set: Record<string, unknown>, notFoundMessage: string, conflictMessage?: string, options?: ReturningOptions): Promise<TRow>;
/** Delete rows matching `where`; returns first deleted row or `undefined`. */
declare function deleteOne(db: any, table: unknown, where: SQL, options?: ReturningOptions): Promise<unknown | undefined>;
/** Delete or throw {@link RowNotFoundError}. */
declare function deleteOneOrThrow(db: any, table: unknown, where: SQL, notFoundMessage: string, options?: ReturningOptions): Promise<unknown>;
/** Delete by primary key `id`. */
declare function deleteById(db: any, table: IdTable, id: string | number, options?: ReturningOptions): Promise<unknown | undefined>;
/** Delete by id or throw; returns `{ success, deletedId, deleted }`. */
declare function deleteByIdOrThrow(db: any, table: IdTable, id: string | number, notFoundMessage: string, options?: ReturningOptions): Promise<DeleteByIdResult>;
/** @deprecated Use {@link deleteByIdOrThrow}. */
declare const deleteOneByIdOrThrow: typeof deleteByIdOrThrow;
/** Delete all rows matching `where`; returns deleted rows. */
declare function deleteMany(db: any, table: unknown, where: SQL, options?: ReturningOptions): Promise<unknown[]>;
/**
 * Insert or update on conflict (Postgres/SQLite `ON CONFLICT DO UPDATE`).
 * Conflict target defaults to the table `id` column.
 */
declare function upsertOne<TRow>(db: any, table: IdTable, values: Record<string, unknown>, updateSet: Record<string, unknown>, options?: ReturningOptions): Promise<TRow>;

/**
 * Offset pagination with parallel count query.
 *
 * @example
 * return paginateTable(db, users, ctx.query, { columns: publicColumns, orderBy: desc(users.createdAt) });
 */
declare function paginateTable<TRow>(db: any, table: unknown, query: PaginatedQuery, options?: Omit<SelectOptions, 'limit' | 'offset'>): Promise<PaginatedResult<TRow>>;
/**
 * Cursor pagination (keyset) — stable for infinite scroll; uses `id > cursor`.
 */
declare function paginateCursor<TRow, TCursor extends string | number = string | number>(db: any, table: IdTable, query: CursorPaginatedQuery, options?: Omit<SelectOptions, 'limit' | 'offset' | 'orderBy'>): Promise<CursorPaginatedResult<TRow, TCursor>>;

/**
 * Run `fn` inside a Drizzle transaction.
 *
 * Intended for **async drivers** (postgres-js, mysql2), which is the kozo-app
 * production target. The synchronous `better-sqlite3` driver does **not** accept
 * async transaction callbacks — use `db.transaction()` with a sync callback there.
 *
 * Falls back to running `fn` directly on `db` when the client has no
 * `.transaction()` method (e.g. mocks / test doubles).
 *
 * @example
 * await runTransaction(db, async (tx) => {
 *   const user = await insertOne(tx, users, { name });
 *   await insertOne(tx, posts, { authorId: user.id });
 * });
 */
declare function runTransaction<T>(db: any, fn: (tx: any) => Promise<T>): Promise<T>;

type DatabaseProvider = 'postgresql' | 'mysql' | 'sqlite';
interface PostgresConfig {
    provider: 'postgresql';
    /** Full connection URL, e.g. postgres://user:pass@host:5432/db */
    url: string;
    schema?: Record<string, unknown>;
    /**
     * Connection / pool / SSL options forwarded to postgres.js.
     * Common keys: `max` (pool size), `idle_timeout`, `connect_timeout`,
     * `max_lifetime`, `ssl`, `prepare`. See the postgres.js docs for the full set.
     *
     * @example
     * { max: 20, idle_timeout: 30, ssl: 'require' }
     */
    options?: {
        max?: number;
        idle_timeout?: number;
        connect_timeout?: number;
        max_lifetime?: number;
        ssl?: boolean | 'require' | 'allow' | 'prefer' | 'verify-full' | Record<string, unknown>;
        prepare?: boolean;
        [key: string]: unknown;
    };
}
interface MysqlConfig {
    provider: 'mysql';
    /** Full connection URL, e.g. mysql://user:pass@host:3306/db */
    url: string;
    schema?: Record<string, unknown>;
}
interface SqliteConfig {
    provider: 'sqlite';
    /** File path. Omit (or use ':memory:') for in-memory database. */
    file?: string;
    schema?: Record<string, unknown>;
    /**
     * Options forwarded to better-sqlite3, e.g. `{ readonly: true }`,
     * `{ fileMustExist: true }`, `{ timeout: 5000 }`.
     */
    options?: {
        readonly?: boolean;
        fileMustExist?: boolean;
        timeout?: number;
        [key: string]: unknown;
    };
}
type DatabaseConfig = PostgresConfig | MysqlConfig | SqliteConfig;
type PostgresDatabase<TSchema extends Record<string, unknown> = Record<string, never>> = PostgresJsDatabase<TSchema>;
type MysqlDatabase<TSchema extends Record<string, unknown> = Record<string, never>> = MySql2Database<TSchema>;
type SqliteDatabase<TSchema extends Record<string, unknown> = Record<string, never>> = BetterSQLite3Database<TSchema>;
/**
 * Create a typed PostgreSQL database (postgres-js + Drizzle).
 *
 * @example
 * import * as schema from './schema';
 * const db = await createDatabase({ provider: 'postgresql', url: process.env.DATABASE_URL!, schema });
 * // db is fully typed as PostgresDatabase<typeof schema>
 */
declare function createDatabase<TSchema extends Record<string, unknown>>(config: PostgresConfig & {
    schema: TSchema;
}): Promise<PostgresDatabase<TSchema>>;
declare function createDatabase(config: PostgresConfig): Promise<PostgresDatabase>;
/**
 * Create a typed MySQL database (mysql2 + Drizzle).
 */
declare function createDatabase<TSchema extends Record<string, unknown>>(config: MysqlConfig & {
    schema: TSchema;
}): Promise<MysqlDatabase<TSchema>>;
declare function createDatabase(config: MysqlConfig): Promise<MysqlDatabase>;
/**
 * Create a typed SQLite database (better-sqlite3 + Drizzle).
 */
declare function createDatabase<TSchema extends Record<string, unknown>>(config: SqliteConfig & {
    schema: TSchema;
}): Promise<SqliteDatabase<TSchema>>;
declare function createDatabase(config: SqliteConfig): Promise<SqliteDatabase>;
/**
 * Create an in-memory SQLite database for testing.
 * Each test file can call this independently — no shared state.
 *
 * @example
 * import * as schema from '../src/schema';
 * const db = createTestDatabase(schema);
 * // Then push the schema:
 * // migrate(db, { migrationsFolder: './drizzle' });
 */
declare function createTestDatabase<TSchema extends Record<string, unknown>>(schema: TSchema): Promise<SqliteDatabase<TSchema>>;
declare function createTestDatabase(): Promise<SqliteDatabase>;

export { type CursorPaginatedQuery, type CursorPaginatedResult, type DatabaseConfig, type DatabaseProvider, type DbClient, type DeleteByIdResult, type IdTable, type MysqlConfig, type MysqlDatabase, type PaginatedQuery, type PaginatedResult, type PostgresConfig, type PostgresDatabase, type ReturningOptions, RowConflictError, RowNotFoundError, type SelectOptions, type SqliteConfig, type SqliteDatabase, countRows, countWhere, createDatabase, createTestDatabase, deleteById, deleteByIdOrThrow, deleteMany, deleteOne, deleteOneByIdOrThrow, deleteOneOrThrow, exists, findById, findByIdOrThrow, findFirst, findMany, findManyAfterCursor, findOne, findOneOrThrow, insertMany, insertOne, isUniqueViolation, paginateCursor, paginateTable, rethrowConflict, runTransaction, updateById, updateByIdOrThrow, updateOne, updateOneOrThrow, upsertOne };
