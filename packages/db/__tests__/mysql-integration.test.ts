import { describe, it, expect } from 'vitest';
import { sql } from '../src/index.js';
import { createDatabase } from '../src/index.js';

const mysqlUrl = process.env.MYSQL_TEST_URL;

describe.skipIf(!mysqlUrl)('@kozojs/db — MySQL integration (MYSQL_TEST_URL)', () => {
  it('connects and runs SELECT 1', async () => {
    const db = await createDatabase({ provider: 'mysql', url: mysqlUrl! });
    const rows = await db.execute(sql`SELECT 1 AS ok`);
    expect(rows).toBeDefined();
  });
});
