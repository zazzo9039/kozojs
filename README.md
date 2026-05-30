# 🔥 Kozo Framework

**The Structure for the Edge** — high-performance TypeScript backend framework with optional native C++ transport via uWebSockets.js.

[![npm version](https://badge.fury.io/js/@kozojs%2Fcore.svg)](https://www.npmjs.com/package/@kozojs/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docs](https://img.shields.io/badge/docs-kozo--docs.vercel.app-orange)](https://kozo-docs.vercel.app)

## ✨ Features

- ⚡ **Native C++ routing** — uWebSockets.js per-route matching, zero JS dispatch in the hot path
- 🚀 **High throughput** — matches bare uWS (0.1% gap), ~33% over Fastify, ~3× over NestJS — see [benchmarks/RESULTS.md](./benchmarks/RESULTS.md)
- 📁 **File-system routing** — zero config (`routes/users/[id].ts` → `GET /users/:id`)
- ✅ **Zod-native validation** — schemas compiled once at startup, no Ajv, no `eval`
- 📝 **Auto OpenAPI 3.1** — generated from your Zod schemas
- 🔌 **Typed client SDK** — `app.generateClient()` emits a fully typed TS client
- 🧪 **In-process test client** — no HTTP server needed in tests
- 🛡️ **RFC 7807 errors** — every error is a `application/problem+json` response
- 🔌 **Plug-and-play modules** — auth (JWT), db (Drizzle), queue (BullMQ/AMQP), redis (cache/pub-sub/rate-limit)
- 🌐 **Three transports, one API** — `listen()` (Node), `nativeListen()` (uWS), `listenSsr()` (Vite SSR + API)

## 📦 Packages

| Package | npm | Description |
|---|---|---|
| [`@kozojs/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@kozojs/core.svg)](https://www.npmjs.com/package/@kozojs/core) | Framework core (router, validation, OpenAPI, SSR, WS, client gen) |
| [`@kozojs/cli`](./packages/cli) | [![npm](https://img.shields.io/npm/v/@kozojs/cli.svg)](https://www.npmjs.com/package/@kozojs/cli) | Project scaffolding (`create-kozo` / `kozo`) |
| [`@kozojs/auth`](./packages/auth) | [![npm](https://img.shields.io/npm/v/@kozojs/auth.svg)](https://www.npmjs.com/package/@kozojs/auth) | JWT authentication middleware (via `jose`) |
| [`@kozojs/db`](./packages/db) | [![npm](https://img.shields.io/npm/v/@kozojs/db.svg)](https://www.npmjs.com/package/@kozojs/db) | Drizzle ORM integration (PostgreSQL / MySQL / SQLite) |
| [`@kozojs/queue`](./packages/queue) | [![npm](https://img.shields.io/npm/v/@kozojs/queue.svg)](https://www.npmjs.com/package/@kozojs/queue) | Multi-backend job queue (BullMQ / AMQP) |
| [`@kozojs/redis`](./packages/redis) | [![npm](https://img.shields.io/npm/v/@kozojs/redis.svg)](https://www.npmjs.com/package/@kozojs/redis) | Redis cache, pub/sub, distributed rate-limit store |
| [`@kozojs/testing`](./packages/testing) | [![npm](https://img.shields.io/npm/v/@kozojs/testing.svg)](https://www.npmjs.com/package/@kozojs/testing) | In-process test client (`createTestClient`, `inject`) |

> **Stability note:** Kozo is pre-1.0. The public API is consolidating but minor breakages may happen between minor versions. Pin exact versions if that matters to you.

## 🚀 Quick Start

```bash
# Scaffold a new project
npx @kozojs/cli my-app
cd my-app
pnpm install
pnpm dev
```

Or wire it up by hand:

```bash
npm install @kozojs/core zod
# Optional, for native transport:
npm install uWebSockets.js
```

```typescript
import { createKozo, z } from '@kozojs/core';

const app = createKozo();

app.get('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  response: z.object({ id: z.string(), name: z.string() }),
}, (ctx) => ({
  id: ctx.params.id,
  name: 'Jane Doe',
}));

await app.listen(3000);
// or, for max throughput:
// await app.nativeListen(3000);
```

## 💻 Two ways to register routes

### 1. Programmatic (works with all transports)

```typescript
import { createKozo, z } from '@kozojs/core';

const app = createKozo<{ db: Database }>({
  services: { db },
});

app.post('/users', {
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
  }),
}, async ({ body, services: { db } }) => {
  return db.users.create(body);
});

await app.listen(3000);
```

### 2. File-system routing

```typescript
// src/index.ts
import { createKozo } from '@kozojs/core';

const app = createKozo({
  routesDir: './src/routes',
  services: { db },
});
await app.loadRoutes();
await app.listen(3000);
```

```typescript
// src/routes/users/[id].ts → GET /users/:id
import { z } from 'zod';

export const schema = {
  params: z.object({ id: z.string().uuid() }),
};

export default ({ params, services: { db } }) => db.users.findById(params.id);
```

Per-directory `_middleware.ts` is automatically picked up:

```
routes/
├── _middleware.ts          → applies to all routes
└── admin/
    ├── _middleware.ts      → applies to /admin/* only
    └── users.ts
```

## 📚 Documentation

- [Getting Started](./docs/getting-started.md) — create a project, register routes, add auth, shutdown
- [Developer Guide](./docs/developer-guide.md) — full API reference for every package
- [Architecture Deep Dive](./docs/architecture.md) — compiler internals, request lifecycle, performance design
- [Auth Middleware](./docs/auth-middleware.md) — JWT middleware configuration
- [Graceful Shutdown](./docs/graceful-shutdown.md) — shutdown lifecycle and database cleanup
- [Benchmarks](./benchmarks/RESULTS.md) — full numbers, methodology, statistical validation
- [Online docs site](https://kozo-docs.vercel.app)

## 🛠️ Development (Monorepo)

```bash
pnpm install         # install all workspace deps
pnpm build           # build all packages
pnpm test            # run all test suites
pnpm dev             # turbo dev mode (watches everything)

cd benchmarks
pnpm bench           # full benchmark suite (startup + latency + throughput)
```

Layout:

```
kozo/
├── packages/
│   ├── core/        # @kozojs/core
│   ├── cli/         # @kozojs/cli
│   ├── auth/        # @kozojs/auth
│   ├── db/          # @kozojs/db
│   ├── queue/       # @kozojs/queue
│   ├── redis/       # @kozojs/redis
│   └── testing/     # @kozojs/testing
├── benchmarks/      # autocannon + latency + startup benchmarks
└── docs/            # markdown documentation
```

## 📄 License

MIT © Kozo Team
