import { describe, it, expect } from 'vitest';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql, eq, createTestDatabase, createDatabase, createInsertSchema } from '../src/index.js';

const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

const schema = { users };

describe('@kozojs/db — createTestDatabase', () => {
  it('returns an in-memory sqlite drizzle instance', async () => {
    const db = await createTestDatabase(schema);
    await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`);
    await db.insert(users).values({ name: 'Ada' });
    const rows = await db.select().from(users);
    expect(rows).toEqual([{ id: 1, name: 'Ada' }]);
  });

  it('isolates state per call (fresh :memory: db)', async () => {
    const db1 = await createTestDatabase(schema);
    const db2 = await createTestDatabase(schema);
    await db1.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`);
    await db2.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`);
    await db1.insert(users).values({ name: 'first' });
    const rows2 = await db2.select().from(users);
    expect(rows2).toEqual([]);
  });
});

describe('@kozojs/db — createDatabase (sqlite)', () => {
  it('creates sqlite database with optional schema', async () => {
    const db = await createDatabase({ provider: 'sqlite', schema });
    await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`);
    await db.insert(users).values({ name: 'Grace' });
    const row = await db.select().from(users).where(eq(users.name, 'Grace'));
    expect(row[0]?.name).toBe('Grace');
  });
});

describe('@kozojs/db — drizzle-zod re-exports', () => {
  it('createInsertSchema builds a zod schema from table', () => {
    const insertSchema = createInsertSchema(users);
    const parsed = insertSchema.parse({ name: 'Lin' });
    expect(parsed.name).toBe('Lin');
  });
});

describe('@kozojs/db — createDatabase errors', () => {
  it('throws on unknown provider', async () => {
    await expect(
      createDatabase({ provider: 'oracle' as 'sqlite', file: ':memory:' }),
    ).rejects.toThrow(/Unknown database provider/);
  });
});
