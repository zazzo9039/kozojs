import { describe, it, expect } from 'vitest';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import {
  sql,
  eq,
  ne,
  and,
  or,
  desc,
  asc,
  count,
  gt,
  lt,
  isNull,
  createTestDatabase,
  createDatabase,
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from '../src/index.js';

const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email'),
});

const schema = { users };

async function createUsersTable(db: Awaited<ReturnType<typeof createTestDatabase>>) {
  await db.run(sql`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT
    )
  `);
}

describe('@kozojs/db — createTestDatabase', () => {
  it('returns an in-memory sqlite drizzle instance', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values({ name: 'Ada' });
    const rows = await db.select().from(users);
    expect(rows).toEqual([{ id: 1, name: 'Ada', email: null }]);
  });

  it('works without a schema argument', async () => {
    const db = await createTestDatabase();
    await db.run(sql`SELECT 1`);
    expect(db).toBeDefined();
  });

  it('isolates state per call (fresh :memory: db)', async () => {
    const db1 = await createTestDatabase(schema);
    const db2 = await createTestDatabase(schema);
    await createUsersTable(db1);
    await createUsersTable(db2);
    await db1.insert(users).values({ name: 'first' });
    const rows2 = await db2.select().from(users);
    expect(rows2).toEqual([]);
  });

  it('supports order by asc and desc', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values([{ name: 'Bob' }, { name: 'Ada' }]);
    const ascRows = await db.select().from(users).orderBy(asc(users.name));
    const descRows = await db.select().from(users).orderBy(desc(users.name));
    expect(ascRows.map((r) => r.name)).toEqual(['Ada', 'Bob']);
    expect(descRows.map((r) => r.name)).toEqual(['Bob', 'Ada']);
  });

  it('supports count aggregate', async () => {
    const db = await createTestDatabase(schema);
    await createUsersTable(db);
    await db.insert(users).values([{ name: 'A' }, { name: 'B' }]);
    const [{ value }] = await db.select({ value: count() }).from(users);
    expect(value).toBe(2);
  });
});

describe('@kozojs/db — createDatabase (sqlite)', () => {
  it('creates sqlite database with optional schema', async () => {
    const db = await createDatabase({ provider: 'sqlite', schema });
    await createUsersTable(db);
    await db.insert(users).values({ name: 'Grace' });
    const row = await db.select().from(users).where(eq(users.name, 'Grace'));
    expect(row[0]?.name).toBe('Grace');
  });

  it('defaults to in-memory when file is omitted', async () => {
    const db = await createDatabase({ provider: 'sqlite' });
    await db.run(sql`SELECT 1`);
    expect(db).toBeDefined();
  });

  it('accepts explicit :memory: file path', async () => {
    const db = await createDatabase({ provider: 'sqlite', file: ':memory:', schema });
    await createUsersTable(db);
    await db.insert(users).values({ name: 'Mem' });
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
  });

  it('filters with eq, ne, and, or', async () => {
    const db = await createDatabase({ provider: 'sqlite', schema });
    await createUsersTable(db);
    await db.insert(users).values([
      { name: 'Ada', email: 'ada@example.com' },
      { name: 'Bob', email: null },
    ]);

    const byEq = await db.select().from(users).where(eq(users.name, 'Ada'));
    expect(byEq).toHaveLength(1);

    const byNe = await db.select().from(users).where(ne(users.name, 'Ada'));
    expect(byNe).toHaveLength(1);

    const byAnd = await db.select().from(users).where(and(eq(users.name, 'Ada'), isNull(users.email)));
    expect(byAnd).toHaveLength(0);

    const byOr = await db.select().from(users).where(or(eq(users.name, 'Ada'), eq(users.name, 'Bob')));
    expect(byOr).toHaveLength(2);
  });

  it('filters with gt and lt on id', async () => {
    const db = await createDatabase({ provider: 'sqlite', schema });
    await createUsersTable(db);
    await db.insert(users).values([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    const rows = await db.select().from(users).where(gt(users.id, 1));
    expect(rows.map((r) => r.name)).toEqual(['B', 'C']);
    const low = await db.select().from(users).where(lt(users.id, 3));
    expect(low).toHaveLength(2);
  });
});

describe('@kozojs/db — query helper re-exports', () => {
  it('exports eq and ne as functions', () => {
    expect(typeof eq).toBe('function');
    expect(typeof ne).toBe('function');
  });

  it('exports and, or, desc, asc as functions', () => {
    expect(typeof and).toBe('function');
    expect(typeof or).toBe('function');
    expect(typeof desc).toBe('function');
    expect(typeof asc).toBe('function');
  });

  it('exports comparison helpers gt and lt', () => {
    expect(typeof gt).toBe('function');
    expect(typeof lt).toBe('function');
  });

  it('exports isNull for nullable column filters', () => {
    expect(typeof isNull).toBe('function');
  });
});

describe('@kozojs/db — drizzle-zod re-exports', () => {
  it('createInsertSchema builds a zod schema from table', () => {
    const insertSchema = createInsertSchema(users);
    const parsed = insertSchema.parse({ name: 'Lin' });
    expect(parsed.name).toBe('Lin');
  });

  it('createInsertSchema rejects invalid payload', () => {
    const insertSchema = createInsertSchema(users);
    expect(() => insertSchema.parse({})).toThrow();
  });

  it('createSelectSchema accepts full row shape', () => {
    const selectSchema = createSelectSchema(users);
    const parsed = selectSchema.parse({ id: 1, name: 'Lin', email: null });
    expect(parsed.name).toBe('Lin');
  });

  it('createSelectSchema rejects row missing required name', () => {
    const selectSchema = createSelectSchema(users);
    expect(() => selectSchema.parse({ id: 1, email: null })).toThrow();
  });

  it('createUpdateSchema allows partial updates', () => {
    const updateSchema = createUpdateSchema(users);
    const parsed = updateSchema.parse({ name: 'Updated' });
    expect(parsed.name).toBe('Updated');
  });

  it('createUpdateSchema allows empty object when all columns optional', () => {
    const updateSchema = createUpdateSchema(users);
    expect(updateSchema.parse({})).toEqual({});
  });
});

describe('@kozojs/db — createDatabase errors', () => {
  it('throws on unknown provider', async () => {
    await expect(
      createDatabase({ provider: 'oracle' as 'sqlite', file: ':memory:' }),
    ).rejects.toThrow(/Unknown database provider/);
  });

  it('error message includes the invalid provider name', async () => {
    await expect(
      createDatabase({ provider: 'mongodb' as 'sqlite', file: ':memory:' }),
    ).rejects.toThrow(/mongodb/);
  });
});

describe('@kozojs/db — sql helper', () => {
  it('executes raw sql via db.run', async () => {
    const db = await createTestDatabase();
    const result = await db.run(sql`SELECT ${1} + ${2} AS sum`);
    expect(result).toBeDefined();
  });
});
