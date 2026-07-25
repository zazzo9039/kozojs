<p align="center">
  <a href="https://github.com/zazzo9039/kozojs">
    <img src="https://raw.githubusercontent.com/zazzo9039/kozojs/main/assets/brand/kozo-banner.jpg" alt="Kozo — TypeScript backend framework: Routes · Validation · OpenAPI · Generated Client" width="960">
  </a>
</p>

# @kozojs/db

Drizzle ORM integration for [Kozo Framework](https://github.com/zazzo9039/kozojs).  
Supports **PostgreSQL** and **SQLite** for production use (including query helpers).  
**MySQL** is connection-only in 0.6.x — use raw Drizzle, not the built-in CRUD helpers.

## Install

```bash
npm install @kozojs/db drizzle-orm
# Add the driver for the selected provider:
npm install postgres          # PostgreSQL
npm install mysql2            # MySQL
npm install better-sqlite3    # SQLite
```

## Quick Start

```typescript
import { createDatabase } from '@kozojs/db';
import { createKozo } from '@kozojs/core';

const db = await createDatabase({
  provider: 'postgresql',
  url: process.env.DATABASE_URL,
  schema: { users },
});

const app = createKozo({ services: { db } });

app.get('/users', {}, (c) => c.services.db.query.users.findMany());

await app.nativeListen(3000);
```

## Supported Providers

| Provider | Status in 0.5.x | Config |
|---|---|---|
| **PostgreSQL** | ✅ Production — full Drizzle + query helpers | `{ provider: 'postgresql', url: 'postgres://...' }` |
| **SQLite** | ✅ Production — tests, local dev, embedded | `{ provider: 'sqlite', file: './db.sqlite' }` |
| **MySQL** | ⚠️ **Connection only** — raw Drizzle queries | `{ provider: 'mysql', url: 'mysql://...' }` |

### Query helpers: PostgreSQL & SQLite only

The CRUD helpers (`insertOne`, `updateById`, `upsertOne`, `paginateTable`, …) target
**PostgreSQL and SQLite**. They rely on Drizzle `.returning()` and Postgres-style
`onConflictDoUpdate` — patterns MySQL does not support the same way.

| Feature | PostgreSQL | SQLite | MySQL |
|---|---|---|---|
| `createDatabase()` + Drizzle queries | ✅ | ✅ | ✅ |
| Query helpers (`insertOne`, …) | ✅ | ✅ | ❌ use raw Drizzle |
| `upsertOne` | ✅ | ✅ | ❌ |
| `isUniqueViolation` / conflict mapping | ✅ | ✅ | ✅ `ER_DUP_ENTRY` (0.5.20+) |

**If you need MySQL today:** call `createDatabase({ provider: 'mysql', … })` and use
Drizzle directly (`db.insert`, `db.select`, …). Do not use `@kozojs/db` write helpers
until a future release adds a MySQL-specific path.

Optional local smoke test (running MySQL instance):

```bash
MYSQL_TEST_URL=mysql://user:pass@127.0.0.1:3306/test pnpm --filter @kozojs/db test
```

When `MYSQL_TEST_URL` is set, `__tests__/mysql-integration.test.ts` runs `SELECT 1`.

## Testing

```typescript
import { createTestDatabase } from '@kozojs/db';

// In-memory SQLite — no setup needed
const db = await createTestDatabase(schema);
```

## Re-exports

All common Drizzle utilities are re-exported for convenience:

```typescript
import { sql, eq, and, or, desc, asc } from '@kozojs/db';
import { createInsertSchema, createSelectSchema } from '@kozojs/db';
```

## License

MIT
