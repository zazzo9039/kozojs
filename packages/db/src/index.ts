import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export type DatabaseProvider = 'postgresql' | 'mysql' | 'sqlite';

// ─── Typed config per provider ────────────────────────────────────────────────

export interface PostgresConfig {
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

export interface MysqlConfig {
  provider: 'mysql';
  /** Full connection URL, e.g. mysql://user:pass@host:3306/db */
  url: string;
  schema?: Record<string, unknown>;
}

export interface SqliteConfig {
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

export type DatabaseConfig = PostgresConfig | MysqlConfig | SqliteConfig;

// ─── Return types ──────────────────────────────────────────────────────────────

export type PostgresDatabase<TSchema extends Record<string, unknown> = Record<string, never>> =
  PostgresJsDatabase<TSchema>;

export type MysqlDatabase<TSchema extends Record<string, unknown> = Record<string, never>> =
  MySql2Database<TSchema>;

export type SqliteDatabase<TSchema extends Record<string, unknown> = Record<string, never>> =
  BetterSQLite3Database<TSchema>;

// ─── createDatabase() — overloaded for precise return types ───────────────────

/**
 * Create a typed PostgreSQL database (postgres-js + Drizzle).
 *
 * @example
 * import * as schema from './schema';
 * const db = await createDatabase({ provider: 'postgresql', url: process.env.DATABASE_URL!, schema });
 * // db is fully typed as PostgresDatabase<typeof schema>
 */
export async function createDatabase<TSchema extends Record<string, unknown>>(
  config: PostgresConfig & { schema: TSchema }
): Promise<PostgresDatabase<TSchema>>;
export async function createDatabase(
  config: PostgresConfig
): Promise<PostgresDatabase>;

/**
 * Create a typed MySQL database (mysql2 + Drizzle).
 */
export async function createDatabase<TSchema extends Record<string, unknown>>(
  config: MysqlConfig & { schema: TSchema }
): Promise<MysqlDatabase<TSchema>>;
export async function createDatabase(
  config: MysqlConfig
): Promise<MysqlDatabase>;

/**
 * Create a typed SQLite database (better-sqlite3 + Drizzle).
 */
export async function createDatabase<TSchema extends Record<string, unknown>>(
  config: SqliteConfig & { schema: TSchema }
): Promise<SqliteDatabase<TSchema>>;
export async function createDatabase(
  config: SqliteConfig
): Promise<SqliteDatabase>;

export async function createDatabase(config: DatabaseConfig): Promise<unknown> {
  const { provider, schema } = config;

  switch (provider) {
    case 'postgresql': {
      const [{ drizzle }, { default: postgres }] = await Promise.all([
        import('drizzle-orm/postgres-js'),
        import('postgres'),
      ]);
      const client = config.options ? postgres(config.url, config.options) : postgres(config.url);
      return drizzle(client, { schema });
    }
    case 'mysql': {
      const [{ drizzle }, mysql] = await Promise.all([
        import('drizzle-orm/mysql2'),
        import('mysql2/promise'),
      ]);
      const pool = mysql.createPool(config.url);
      return drizzle(pool, { schema, mode: 'default' });
    }
    case 'sqlite': {
      const [{ drizzle }, { default: Database }] = await Promise.all([
        import('drizzle-orm/better-sqlite3'),
        import('better-sqlite3'),
      ]);
      const dbFile = config.file ?? ':memory:';
      const sqlite = config.options ? new Database(dbFile, config.options) : new Database(dbFile);
      return drizzle(sqlite, { schema });
    }
    default:
      throw new Error(`Unknown database provider: ${(config as any).provider}`);
  }
}

// ─── createTestDatabase() — SQLite in-memory (ideal for unit tests) ───────────

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
export async function createTestDatabase<TSchema extends Record<string, unknown>>(
  schema: TSchema
): Promise<SqliteDatabase<TSchema>>;
export async function createTestDatabase(): Promise<SqliteDatabase>;
export async function createTestDatabase(schema?: Record<string, unknown>): Promise<SqliteDatabase<any>> {
  const [{ drizzle }, { default: Database }] = await Promise.all([
    import('drizzle-orm/better-sqlite3'),
    import('better-sqlite3'),
  ]);
  const sqlite = new Database(':memory:');
  return drizzle(sqlite, { schema }) as any;
}

// ─── Re-export drizzle-orm query helpers ─────────────────────────────────────
export {
  sql, eq, ne, and, or, not,
  like, ilike, notLike,
  isNull, isNotNull,
  inArray, notInArray,
  between, notBetween,
  gt, gte, lt, lte,
  desc, asc,
  count, sum, avg, min, max,
  getTableColumns,
} from 'drizzle-orm';
export type { SQL } from 'drizzle-orm';

// ─── Re-export drizzle-zod schema generators (Zod v3 + v4 compatible) ─────────
export {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
  createSchemaFactory,
} from 'drizzle-zod';

// ─── Query helpers (CRUD, pagination, transactions) ──────────────────────────
export {
  // Types
  type DbClient,
  type IdTable,
  type PaginatedQuery,
  type PaginatedResult,
  type CursorPaginatedQuery,
  type CursorPaginatedResult,
  type SelectOptions,
  type ReturningOptions,
  type DeleteByIdResult,
  // Errors
  RowNotFoundError,
  RowConflictError,
  isUniqueViolation,
  rethrowConflict,
  // Read
  findMany,
  findOne,
  findFirst,
  findOneOrThrow,
  findById,
  findByIdOrThrow,
  exists,
  countRows,
  countWhere,
  findManyAfterCursor,
  // Write
  insertOne,
  insertMany,
  updateOne,
  updateOneOrThrow,
  updateById,
  updateByIdOrThrow,
  deleteOne,
  deleteOneOrThrow,
  deleteById,
  deleteByIdOrThrow,
  deleteOneByIdOrThrow,
  deleteMany,
  upsertOne,
  // Pagination
  paginateTable,
  paginateCursor,
  // Transactions
  runTransaction,
} from './query-helpers/index.js';
