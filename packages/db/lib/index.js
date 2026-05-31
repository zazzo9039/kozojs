// src/index.ts
import {
  sql,
  eq as eq3,
  ne,
  and as and2,
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
  gt as gt3,
  gte,
  lt,
  lte,
  desc,
  asc,
  count as count3,
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

// src/query-helpers/errors.ts
var RowNotFoundError = class extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "RowNotFoundError";
  }
};
var RowConflictError = class extends Error {
  code = "23505";
  constructor(message = "Conflict") {
    super(message);
    this.name = "RowConflictError";
  }
};
function isUniqueViolation(err) {
  const code = err?.code;
  return code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE";
}
function rethrowConflict(err, message = "Conflict") {
  if (isUniqueViolation(err)) throw new RowConflictError(message);
  throw err;
}

// src/query-helpers/read.ts
import { count, eq, gt } from "drizzle-orm";
function applyOrderBy(q, orderBy) {
  if (!orderBy) return q;
  const cols = Array.isArray(orderBy) ? orderBy : [orderBy];
  return q.orderBy(...cols);
}
function buildSelect(db, table, options) {
  let q = options?.columns ? db.select(options.columns).from(table) : db.select().from(table);
  if (options?.where) q = q.where(options.where);
  q = applyOrderBy(q, options?.orderBy);
  return q;
}
async function runSelect(q, options) {
  if (options?.limit != null && options.offset != null) {
    return await q.limit(options.limit).offset(options.offset);
  }
  if (options?.limit != null) {
    return await q.limit(options.limit);
  }
  return await q;
}
async function findMany(db, table, options) {
  const q = buildSelect(db, table, options);
  return runSelect(q, options);
}
async function findOne(db, table, where, options) {
  const rows = await findMany(db, table, { ...options, where, limit: 1 });
  return rows[0];
}
var findFirst = findOne;
async function findOneOrThrow(db, table, where, notFoundMessage, options) {
  const row = await findOne(db, table, where, options);
  if (!row) throw new RowNotFoundError(notFoundMessage);
  return row;
}
async function findById(db, table, id, options) {
  return findOne(db, table, eq(table.id, id), options);
}
async function findByIdOrThrow(db, table, id, notFoundMessage, options) {
  return findOneOrThrow(db, table, eq(table.id, id), notFoundMessage, options);
}
async function exists(db, table, where) {
  const q = where ? db.select({ value: count() }).from(table).where(where) : db.select({ value: count() }).from(table);
  const [{ value }] = await q;
  return value > 0;
}
async function countRows(db, table, where) {
  const q = where ? db.select({ value: count() }).from(table).where(where) : db.select({ value: count() }).from(table);
  const [{ value }] = await q;
  return value;
}
async function countWhere(db, table, where) {
  return countRows(db, table, where);
}
async function findManyAfterCursor(db, table, query, options) {
  const where = query.cursor != null ? gt(table.id, query.cursor) : void 0;
  return findMany(db, table, {
    ...options,
    where,
    limit: query.limit + 1
  });
}

// src/query-helpers/write.ts
import { eq as eq2 } from "drizzle-orm";
function returningArgs(options) {
  if (!options?.returning || options.returning === "*") return void 0;
  return options.returning;
}
async function insertOne(db, table, values, options) {
  const returning = returningArgs(options);
  const builder = db.insert(table).values(values);
  const rows = returning ? await builder.returning(returning) : await builder.returning();
  return rows[0];
}
async function insertMany(db, table, values, options) {
  const returning = returningArgs(options);
  const builder = db.insert(table).values(values);
  return returning ? await builder.returning(returning) : await builder.returning();
}
async function updateOne(db, table, set, where, options) {
  const returning = returningArgs(options);
  const builder = db.update(table).set(set).where(where);
  const rows = returning ? await builder.returning(returning) : await builder.returning();
  return rows[0];
}
async function updateOneOrThrow(db, table, set, where, notFoundMessage, options) {
  const row = await updateOne(db, table, set, where, options);
  if (!row) throw new RowNotFoundError(notFoundMessage);
  return row;
}
async function updateById(db, table, id, set, options) {
  return updateOne(db, table, set, eq2(table.id, id), options);
}
async function updateByIdOrThrow(db, table, id, set, notFoundMessage, conflictMessage = "Conflict", options) {
  try {
    const row = await updateById(db, table, id, set, options);
    if (!row) throw new RowNotFoundError(notFoundMessage);
    return row;
  } catch (err) {
    if (err instanceof RowNotFoundError) throw err;
    rethrowConflict(err, conflictMessage);
  }
}
async function deleteOne(db, table, where, options) {
  const returning = returningArgs(options);
  const builder = db.delete(table).where(where);
  const rows = returning ? await builder.returning(returning) : await builder.returning();
  return rows[0];
}
async function deleteOneOrThrow(db, table, where, notFoundMessage, options) {
  const deleted = await deleteOne(db, table, where, options);
  if (!deleted) throw new RowNotFoundError(notFoundMessage);
  return deleted;
}
async function deleteById(db, table, id, options) {
  return deleteOne(db, table, eq2(table.id, id), options);
}
async function deleteByIdOrThrow(db, table, id, notFoundMessage, options) {
  const deleted = await deleteOneOrThrow(db, table, eq2(table.id, id), notFoundMessage, options);
  return { success: true, deletedId: String(id), deleted };
}
var deleteOneByIdOrThrow = deleteByIdOrThrow;
async function deleteMany(db, table, where, options) {
  const returning = returningArgs(options);
  const builder = db.delete(table).where(where);
  return returning ? await builder.returning(returning) : await builder.returning();
}
async function upsertOne(db, table, values, updateSet, options) {
  const returning = returningArgs(options);
  const rows = await db.insert(table).values(values).onConflictDoUpdate({
    target: table.id,
    set: updateSet
  }).returning(returning);
  return rows[0];
}

// src/query-helpers/paginate.ts
import { and, count as count2, gt as gt2 } from "drizzle-orm";
async function paginateTable(db, table, query, options) {
  const { page, limit } = query;
  const offset = (page - 1) * limit;
  const { where, columns, orderBy } = options ?? {};
  const rowsQuery = columns ? db.select(columns).from(table) : db.select().from(table);
  const countQuery = db.select({ value: count2() }).from(table);
  let filteredRows = where ? rowsQuery.where(where) : rowsQuery;
  if (orderBy) {
    const cols = Array.isArray(orderBy) ? orderBy : [orderBy];
    filteredRows = filteredRows.orderBy(...cols);
  }
  const [rows, countRows2] = await Promise.all([
    filteredRows.limit(limit).offset(offset),
    where ? countQuery.where(where) : countQuery
  ]);
  const total = countRows2[0].value;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data: rows,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}
async function paginateCursor(db, table, query, options) {
  const whereParts = [];
  if (options?.where) whereParts.push(options.where);
  if (query.cursor != null) whereParts.push(gt2(table.id, query.cursor));
  const combinedWhere = whereParts.length === 1 ? whereParts[0] : whereParts.length > 1 ? and(...whereParts) : void 0;
  const rows = await findMany(db, table, {
    ...options,
    where: combinedWhere,
    limit: query.limit + 1
  });
  const hasNext = rows.length > query.limit;
  const data = hasNext ? rows.slice(0, query.limit) : rows;
  const nextCursor = hasNext ? data[data.length - 1]?.id ?? null : null;
  return { data, nextCursor, hasNext };
}

// src/query-helpers/transaction.ts
async function runTransaction(db, fn) {
  if (typeof db.transaction === "function") {
    return db.transaction(fn);
  }
  return fn(db);
}

// src/index.ts
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
  RowConflictError,
  RowNotFoundError,
  and2 as and,
  asc,
  avg,
  between,
  count3 as count,
  countRows,
  countWhere,
  createDatabase,
  createInsertSchema,
  createSchemaFactory,
  createSelectSchema,
  createTestDatabase,
  createUpdateSchema,
  deleteById,
  deleteByIdOrThrow,
  deleteMany,
  deleteOne,
  deleteOneByIdOrThrow,
  deleteOneOrThrow,
  desc,
  eq3 as eq,
  exists,
  findById,
  findByIdOrThrow,
  findFirst,
  findMany,
  findManyAfterCursor,
  findOne,
  findOneOrThrow,
  getTableColumns,
  gt3 as gt,
  gte,
  ilike,
  inArray,
  insertMany,
  insertOne,
  isNotNull,
  isNull,
  isUniqueViolation,
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
  paginateCursor,
  paginateTable,
  rethrowConflict,
  runTransaction,
  sql,
  sum,
  updateById,
  updateByIdOrThrow,
  updateOne,
  updateOneOrThrow,
  upsertOne
};
