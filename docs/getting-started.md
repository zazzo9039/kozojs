# Getting Started with Kozo

End-to-end path from zero to a running API — copy-paste friendly.

## 1. Create a project

```bash
npx @kozojs/cli my-app --template file-routing
cd my-app
cp .env.example .env
pnpm dev
```

Templates:

| Template | Use case |
|----------|----------|
| `minimal` | Two manual routes, smallest footprint |
| `file-routing` | `_middleware.ts`, JWT, `[id]` params, admin guards |
| `fullstack-ssr` | `listenSsr()` — API + React on one port |

Interactive wizard (legacy scaffolds):

```bash
npx @kozojs/cli my-app
```

## 2. First route (file routing)

Create `src/routes/hello/get.ts`:

```typescript
import { z } from 'zod';

export const schema = {
  query: z.object({ name: z.string().optional() }),
  response: z.object({ message: z.string() }),
};

export default (ctx) => ({
  message: `Hello, ${ctx.query.name ?? 'world'}!`,
});
```

→ `GET /hello?name=Kozo`

Run `kozo routes` to list discovered routes.

## 3. Dependency injection

**Singletons** — stateless services shared across requests:

```typescript
const app = createKozo<{ db: Pool }>({
  services: { db: pool },
});
```

**Per-request scope** — transactions, correlation IDs, tenant connections:

```typescript
const app = createKozo({
  services: { db: pool },
  scopedServices: (base, req) => ({
    reqId: req.header('x-request-id') ?? crypto.randomUUID(),
  }),
  onRequestEnd: async (scoped, error) => {
    // commit/rollback/release scoped resources
  },
});
```

Use singletons for pools/clients; use `scopedServices` when state must not leak between concurrent requests.

## 4. Authentication

Security is **guard-based** (0.5.16+): the same checks run on `listen()` and `nativeListen()` at native speed. Register guards **before** `loadRoutes()`:

```typescript
import { registerAuthGuard, roleGuard } from '@kozojs/auth';

await registerAuthGuard(app, process.env.JWT_SECRET!, {
  routesDir: './src/routes',
  prefix: '',
});
app.guard('/admin/*', roleGuard('admin'));
await app.loadRoutes();
```

Mark public routes with `export const meta = { auth: false }`.

## 5. OpenAPI + typed client

After routes are registered:

```bash
kozo gen:client --out src/generated/client.ts
```

Requires `export async function buildApp()` in `src/app.ts` (see templates).

## 6. Transport

| Method | When |
|--------|------|
| `app.listen()` | Default Node HTTP (Hono) — dev & most deployments |
| `app.nativeListen()` | Max throughput (uWebSockets.js), WebSockets |
| `app.listenSsr()` | Unified API + Vite SSR (see `fullstack-ssr` template) |

## 7. Shutdown & deploy

```typescript
createKozo({
  onStart: async ({ services }) => { await services.db.migrate(); },
  onStop: async ({ services }) => { await services.db.close(); },
});

process.on('SIGTERM', () => void app.shutdown());
process.on('SIGINT', () => void app.shutdown());
```

Deploy as a standard Node 20+ process (`pnpm start`). Set `PORT`, `JWT_SECRET`, and database env vars in production.

## Examples in this repo

```bash
# Runnable file-routing demo
pnpm --filter file-routing dev

# Monorepo smoke test
pnpm --filter file-routing exec tsx scripts/smoke.ts
```

See also: [developer-guide.md](./developer-guide.md), [IMPROVEMENT-PLAN.md](../IMPROVEMENT-PLAN.md).
