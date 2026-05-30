import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
export { SQL, and, asc, avg, between, count, desc, eq, getTableColumns, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, max, min, ne, not, notBetween, notInArray, notLike, or, sql, sum } from 'drizzle-orm';
export { createInsertSchema, createSchemaFactory, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

type DatabaseProvider = 'postgresql' | 'mysql' | 'sqlite';
interface PostgresConfig {
    provider: 'postgresql';
    /** Full connection URL, e.g. postgres://user:pass@host:5432/db */
    url: string;
    schema?: Record<string, unknown>;
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

export { type DatabaseConfig, type DatabaseProvider, type MysqlConfig, type MysqlDatabase, type PostgresConfig, type PostgresDatabase, type SqliteConfig, type SqliteDatabase, createDatabase, createTestDatabase };
