// src/index.ts
import {
  sql,
  eq,
  ne,
  and,
  or,
  not,
  like,
  ilike,
  notLike,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  between,
  notBetween,
  gt,
  gte,
  lt,
  lte,
  desc,
  asc,
  count,
  sum,
  avg,
  min,
  max,
  getTableColumns
} from "drizzle-orm";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
  createSchemaFactory
} from "drizzle-zod";
async function createDatabase(config) {
  const { provider, schema } = config;
  switch (provider) {
    case "postgresql": {
      const [{ drizzle }, { default: postgres }] = await Promise.all([
        import("drizzle-orm/postgres-js"),
        import("postgres")
      ]);
      const client = postgres(config.url);
      return drizzle(client, { schema });
    }
    case "mysql": {
      const [{ drizzle }, mysql] = await Promise.all([
        import("drizzle-orm/mysql2"),
        import("mysql2/promise")
      ]);
      const pool = mysql.createPool(config.url);
      return drizzle(pool, { schema, mode: "default" });
    }
    case "sqlite": {
      const [{ drizzle }, { default: Database }] = await Promise.all([
        import("drizzle-orm/better-sqlite3"),
        import("better-sqlite3")
      ]);
      const dbFile = config.file ?? ":memory:";
      const sqlite = new Database(dbFile);
      return drizzle(sqlite, { schema });
    }
    default:
      throw new Error(`Unknown database provider: ${config.provider}`);
  }
}
async function createTestDatabase(schema) {
  const [{ drizzle }, { default: Database }] = await Promise.all([
    import("drizzle-orm/better-sqlite3"),
    import("better-sqlite3")
  ]);
  const sqlite = new Database(":memory:");
  return drizzle(sqlite, { schema });
}
export {
  and,
  asc,
  avg,
  between,
  count,
  createDatabase,
  createInsertSchema,
  createSchemaFactory,
  createSelectSchema,
  createTestDatabase,
  createUpdateSchema,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notBetween,
  notInArray,
  notLike,
  or,
  sql,
  sum
};
