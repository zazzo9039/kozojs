import { describe, it, expect } from 'vitest';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import {
  sql,
  eq,
  asc,
  createTestDatabase,
  paginateTable,
  paginateCursor,
  findOne,
  findOneOrThrow,
  findMany,
  findById,
  findByIdOrThrow,
  exists,
  countRows,
  countWhere,
  insertOne,
  insertMany,
  updateOne,
  updateOneOrThrow,
  updateById,
  updateByIdOrThrow,
  deleteOne,
  deleteOneOrThrow,
  deleteByIdOrThrow,
  deleteMany,
  deleteOneByIdOrThrow,
  RowNotFoundError,
  RowConflictError,
  isUniqueViolation,
  runTransaction,
} from '../src/index.js';

const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique(),
  secret: text('secret'),
});

const schema = { users };

async function createUsersTable(db: Awaited<ReturnType<typeof createTestDatabase>>) {
  await db.run(sql`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      secret TEXT
    )
  `);
}

async function seedUsers(db: Awaited<ReturnType<typeof createTestDatabase>>) {
  await db.insert(users).values([
    { name: 'Ada', email: 'ada@example.com', secret: 'hidden1' },
    { name: 'Bob', email: 'bob@example.com', secret: 'hidden2' },
    { name: 'Carol', email: 'carol@example.com', secret: 'hidden3' },
    { name: 'Dan', email: 'dan@example.com', secret: 'hidden4' },
    { name: 'Eve', email: 'eve@example.com', secret: 'hidden5' },
  ]);
}

describe('@kozojs/db — paginateTable', () => {
  it('returns a paginated slice with metadata', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await seedUsers(db);

    const page1 = await paginateTable<{ id: number; name: string; email: string | null }>(
      db,
      users,
      { page: 1, limit: 2 },
      { columns: { id: users.id, name: users.name, email: users.email }, orderBy: asc(users.id) },
    );

    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasNext).toBe(true);
    expect(page1.data[0]).not.toHaveProperty('secret');
  });

  it('respects where filter', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await seedUsers(db);

    const result = await paginateTable(db, users, { page: 1, limit: 10 }, {
      where: eq(users.name, 'Ada'),
    });

    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('Ada');
  });
});

describe('@kozojs/db — paginateCursor', () => {
  it('returns next cursor when more rows exist', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await seedUsers(db);

    const page1 = await paginateCursor(db, users, { limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.hasNext).toBe(true);
    expect(page1.nextCursor).toBe(2);

    const page2 = await paginateCursor(db, users, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.data).toHaveLength(2);
    expect(page2.hasNext).toBe(true);
  });
});

describe('@kozojs/db — read helpers', () => {
  it('findMany returns all rows', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await seedUsers(db);
    const rows = await findMany(db, users);
    expect(rows).toHaveLength(5);
  });

  it('findById and findByIdOrThrow', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values({ name: 'Lin', email: 'lin@example.com' });
    const row = await findById(db, users, 1);
    expect(row?.name).toBe('Lin');
    await expect(findByIdOrThrow(db, users, 99, 'nope')).rejects.toBeInstanceOf(RowNotFoundError);
  });

  it('exists and count helpers', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await seedUsers(db);
    expect(await exists(db, users, eq(users.name, 'Ada'))).toBe(true);
    expect(await exists(db, users, eq(users.name, 'Missing'))).toBe(false);
    expect(await countRows(db, users)).toBe(5);
    expect(await countWhere(db, users, eq(users.name, 'Bob'))).toBe(1);
  });

  it('findOneOrThrow throws RowNotFoundError', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await expect(findOneOrThrow(db, users, eq(users.id, 1), 'missing')).rejects.toBeInstanceOf(RowNotFoundError);
  });
});

describe('@kozojs/db — write helpers', () => {
  it('insertOne and insertMany', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    const one = await insertOne(db, users, { name: 'Solo', email: 'solo@example.com' });
    expect(one.name).toBe('Solo');
    const many = await insertMany(db, users, [
      { name: 'A', email: 'a@example.com' },
      { name: 'B', email: 'b@example.com' },
    ]);
    expect(many).toHaveLength(2);
  });

  it('updateOne and updateById', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values({ name: 'Old', email: 'old@example.com' });
    const updated = await updateById(db, users, 1, { name: 'New' });
    expect(updated?.name).toBe('New');
    await expect(updateOneOrThrow(db, users, { name: 'X' }, eq(users.id, 999), 'missing'))
      .rejects.toBeInstanceOf(RowNotFoundError);
  });

  it('updateByIdOrThrow maps unique violations to RowConflictError', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values([
      { name: 'A', email: 'a@example.com' },
      { name: 'B', email: 'b@example.com' },
    ]);
    await expect(
      updateByIdOrThrow(db, users, 2, { email: 'a@example.com' }, 'missing', 'Email taken'),
    ).rejects.toBeInstanceOf(RowConflictError);
  });

  it('delete helpers', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values({ name: 'Del', email: 'del@example.com' });

    expect(await deleteOne(db, users, eq(users.id, 999))).toBeUndefined();

    const result = await deleteByIdOrThrow(db, users, 1, 'User not found');
    expect(result.success).toBe(true);
    expect(result.deletedId).toBe('1');

    await db.insert(users).values([
      { name: 'X', email: 'x@example.com' },
      { name: 'Y', email: 'y@example.com' },
    ]);
    const removed = await deleteMany(db, users, eq(users.name, 'X'));
    expect(removed).toHaveLength(1);
  });

  it('deleteOneByIdOrThrow alias works', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values({ name: 'Z', email: 'z@example.com' });
    const result = await deleteOneByIdOrThrow(db, users, '1', 'nope');
    expect(result.deletedId).toBe('1');
  });
});

describe('@kozojs/db — error helpers', () => {
  it('isUniqueViolation detects sqlite unique errors', () => {
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: 'ER_DUP_ENTRY' })).toBe(true);
    expect(isUniqueViolation({ code: 'XX000' })).toBe(false);
  });
});

describe('@kozojs/db — runTransaction', () => {
  it('delegates to db.transaction when available', async () => {
    let received: unknown;
    const fakeDb = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        received = 'tx-client';
        return fn(received);
      },
    };
    const result = await runTransaction(fakeDb as any, async (tx) => {
      expect(tx).toBe('tx-client');
      return 42;
    });
    expect(result).toBe(42);
    expect(received).toBe('tx-client');
  });

  it('falls back to running fn directly when no transaction method', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    // strip the (sync-only) transaction method to exercise the fallback path
    const dbNoTx = new Proxy(db, {
      get(target, prop) {
        if (prop === 'transaction') return undefined;
        return (target as any)[prop];
      },
    });
    const result = await runTransaction(dbNoTx as any, async (tx) => {
      await insertOne(tx, users, { name: 'Tx', email: 'tx@example.com' });
      return countRows(tx, users);
    });
    expect(result).toBe(1);
  });
});

describe('@kozojs/db — row errors', () => {
  it('RowNotFoundError is a NotFoundError (404)', async () => {
    const { NotFoundError, KozoError } = await import('@kozojs/core');
    const err = new RowNotFoundError('missing user');
    expect(err).toBeInstanceOf(RowNotFoundError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(KozoError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('not-found');
  });

  it('RowConflictError is a ConflictError (409)', async () => {
    const { ConflictError, KozoError } = await import('@kozojs/core');
    const err = new RowConflictError('duplicate');
    expect(err).toBeInstanceOf(RowConflictError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(KozoError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('conflict');
  });
});
