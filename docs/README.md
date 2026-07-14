# 🔥 Kozo Framework — Documentation

> **The Structure for the Edge** — high-performance TypeScript backend framework with optional native C++ transport via uWebSockets.js.

This folder contains the long-form documentation for Kozo. For a quick overview, see the [project README](../README.md). For the live site, see [kozo-docs.vercel.app](https://kozo-docs.vercel.app).

---

## 📚 Documentation Index

| Document | Description |
|---|---|
| [Getting Started](./getting-started.md) | Create a project, register routes, add auth, shutdown |
| [Common Pitfalls](./common-pitfalls.md) | Auth order, DI scoping, WS, 413, CLI — troubleshooting |
| [Developer Guide](./developer-guide.md) | Full API reference across all packages |
| [Architecture Deep Dive](./architecture.md) | Compiler internals, request lifecycle, performance design |
| [Authentication Middleware](./auth-middleware.md) | JWT middleware configuration |
| [Graceful Shutdown](./graceful-shutdown.md) | Shutdown lifecycle and database cleanup |
| [Development History](./development-history.md) | How the project evolved (internal, Italian) |
| [Benchmarks](../benchmarks/RESULTS.md) | Throughput, latency, methodology |

---

## 🧩 Packages

Kozo is a monorepo. The public scope is `@kozojs/*`. The packages currently published on npm are:

| Package | Description |
|---|---|
| [`@kozojs/core`](../packages/core/README.md) | Framework core: router, validation, OpenAPI, SSR, WebSocket, client gen |
| [`@kozojs/cli`](../packages/cli/README.md) | Project scaffolding (`create-kozo` / `kozo`) |
| [`@kozojs/auth`](../packages/auth/README.md) | JWT authentication middleware (built on `jose`) |
| [`@kozojs/db`](../packages/db/README.md) | Drizzle ORM integration (PostgreSQL / MySQL / SQLite) |
| [`@kozojs/queue`](../packages/queue/README.md) | Multi-backend job queue (BullMQ / AMQP) |
| [`@kozojs/redis`](../packages/redis/README.md) | Cache, pub/sub, distributed rate-limit store |
| [`@kozojs/testing`](../packages/testing/README.md) | In-process test client (no HTTP server needed) |

> Each package has its own README with installation, options, and examples.

---

## ⚡ Philosophy

- **Zero boilerplate** — no classes, no decorators, no DI containers
- **File-system routing** — your folder structure is your URL structure
- **Type-safe** — Zod is the single source of truth, schemas compile once at startup
- **Edge-ready** — works on Node, Bun, Cloudflare Workers, Deno via `app.fetch`
- **Production-minded** — RFC 7807 errors, graceful shutdown, rate limiting, body size limits, webhook signature verification

```typescript
// Just your logic
export default async ({ services: { userService } }) => {
  return userService.doSomething();
};
```

---

## 🏗 Architecture (one-paragraph version)

Kozo registers routes through three transport modes that share the same handler API:

```
┌────────────────────────────────────────────────────────────────┐
│ Public API: createKozo() + .get/.post/.put/.patch/.delete/.ws  │
├────────────────────────────────────────────────────────────────┤
│ Schema compiler  →  pre-compiled handler closures             │
├──────────────┬───────────────────────────┬─────────────────────┤
│  listen()    │     nativeListen()        │   listenSsr()       │
│ @hono/node-  │   uWebSockets.js (C++)    │ Vite SSR + Hono     │
│ server       │   per-route C++ matching  │ on a single port    │
└──────────────┴───────────────────────────┴─────────────────────┘
```

See [`architecture.md`](./architecture.md) for the deep dive.

---

## 🚀 Quick Start

### Scaffold a new project

```bash
npx @kozojs/cli my-app
cd my-app
pnpm install
pnpm dev
```

### Or wire it up manually

```bash
mkdir my-app && cd my-app
pnpm init
pnpm add @kozojs/core zod
# Optional: native transport (published on GitHub, not npm)
pnpm add uNetworking/uWebSockets.js#v20.66.0
```

```typescript
// src/index.ts
import { createKozo, z } from '@kozojs/core';

const app = createKozo();

app.get('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  response: z.object({ id: z.string(), name: z.string() }),
}, (ctx) => ({ id: ctx.params.id, name: 'Jane' }));

await app.listen(3000);
```

### Project structure (file-system routing)

```
my-app/
├── src/
│   ├── routes/
│   │   ├── index.ts          → GET /
│   │   ├── _middleware.ts    → applies to all routes
│   │   └── users/
│   │       ├── _middleware.ts  → applies to /users/*
│   │       ├── index.ts        → GET / POST /users
│   │       └── [id].ts         → GET / PUT / DELETE /users/:id
│   ├── services/index.ts     # Service definitions
│   └── index.ts              # Entry point
├── package.json
└── tsconfig.json
```

---

## 🛡 Validation (Zod-native)

Export `schema` from your route file (or pass it inline to `.get/.post/...`) and Kozo validates body, query, and params automatically.

```typescript
export const schema = {
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
  }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().max(100).default(10),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
};
```

Failed validation produces an RFC 7807 `application/problem+json` response:

```json
{
  "type": "https://kozo-docs.vercel.app/docs/core/errors#validation-failed",
  "title": "Validation Failed",
  "status": 400,
  "errors": [
    { "field": "email", "message": "Invalid email", "code": "invalid_string" }
  ]
}
```

---

## 🚀 Deployment

### Cloudflare Workers / Deno

```typescript
import { createKozo } from '@kozojs/core';

const app = createKozo();
// register routes…
export default { fetch: app.fetch };
```

### Vercel Edge

```typescript
import { createKozo } from '@kozojs/core';

const app = createKozo();
export const config = { runtime: 'edge' };
export default app.fetch;
```

### Node.js

```typescript
import { createKozo } from '@kozojs/core';

const app = createKozo();
await app.listen(3000);
```

### Node.js + uWebSockets.js (max throughput)

```bash
# uWebSockets.js is published on GitHub, not npm
pnpm add uNetworking/uWebSockets.js#v20.66.0
```

```typescript
await app.nativeListen(3000);
```

---

## 📊 Benchmarks

Kozo is benchmarked against bare `uWebSockets.js`, Fastify and NestJS on three axes: startup time, request latency, and throughput. See [benchmarks/RESULTS.md](../benchmarks/RESULTS.md) for the full numbers and methodology (interleaved requests, multiple rounds, statistical significance).

```bash
cd benchmarks
pnpm bench         # full suite (startup + latency + throughput)
pnpm bench:autocannon
```

---

## 📦 Install Everything Locally (Monorepo)

```bash
pnpm install
pnpm build
pnpm test
```

---

## License

MIT © Kozo Team
