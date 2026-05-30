# @kozojs/db

Drizzle ORM integration for [Kozo Framework](https://github.com/zazzo9039/kozo).  
Supports PostgreSQL, MySQL, and SQLite with a single unified API.

## Install

```bash
npm install @kozojs/db drizzle-orm
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

| Provider | Config |
|---|---|
| **PostgreSQL** | `{ provider: 'postgresql', url: 'postgres://...' }` |
| **MySQL** | `{ provider: 'mysql', url: 'mysql://...' }` |
| **SQLite** | `{ provider: 'sqlite', file: './db.sqlite' }` |

## Testing

```typescript
import { createTestDatabase } from '@kozojs/db';

// In-memory SQLite — no setup needed
const db = createTestDatabase(schema);
```

## Re-exports

All common Drizzle utilities are re-exported for convenience:

```typescript
import { sql, eq, and, or, desc, asc } from '@kozojs/db';
import { createInsertSchema, createSelectSchema } from '@kozojs/db';
```

## License

MIT
