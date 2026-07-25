# @kozojs/core

**Build a TypeScript backend from one route contract.**

Define a route once with a Zod schema — runtime validation, an OpenAPI 3.1 spec, and a fully-typed TypeScript client all come from that one definition. With no extra wiring you get:

- **Runtime validation** — RFC 7807 errors on bad input, zero boilerplate
- **OpenAPI 3.1** — generated from the same schema
- **A route-derived client SDK** — `app.generateClient()` → `api.postUsers(body)`
- **Native-speed routing** — an optional uWebSockets.js transport registers routes straight into a C++ radix trie

Kozo requires Node.js 20.19 or newer. `app.listen()` is the default Node.js transport; `app.nativeListen()` and `app.listenSsr()` add optional native and Vite integrations. `app.fetch` exposes the underlying Fetch API handler for compatible adapters.

```
npm install @kozojs/core zod
```

---

## Quick Start

```typescript
import { createKozo, z } from '@kozojs/core';

const app = createKozo();

app.get('/users/:id', {
  params: z.object({ id: z.string().uuid() }),
  response: z.object({ id: z.string(), name: z.string() }),
}, (ctx) => ({
  id: ctx.params.id,
  name: 'John Doe',
}));

await app.listen(3000);
```

---

## Table of Contents

- [Server Modes](#server-modes)
- [Route Registration](#route-registration)
- [Route Groups](#route-groups)
- [Schema Validation](#schema-validation)
- [Services (Dependency Injection)](#services-dependency-injection)
- [Guards](#guards-security--single-source-of-truth)
- [Middleware](#middleware)
- [Error Handling (RFC 7807)](#error-handling-rfc-7807)
- [Graceful Shutdown](#graceful-shutdown)
- [Type-Safe Client Generation](#type-safe-client-generation)
- [OpenAPI Generation](#openapi-generation)
- [File-System Routing](#file-system-routing)
- [WebSocket (uWS)](#websocket-uws)
- [SSR Integration](#ssr-integration)
- [Helper Schemas & Utilities](#helper-schemas--utilities)
- [Fast Response Utilities](#fast-response-utilities)
- [Runtime Compatibility](#runtime-compatibility)
- [API Reference](#api-reference)

---

## Server Modes

Kozo offers three server transports. Same routes, same handlers — pick the transport that fits your deployment.

### `app.listen(port?)` — Node.js HTTP

Standard `node:http` server via `@hono/node-server`. Works everywhere.

```typescript
await app.listen(3000);
```

### `app.nativeListen(port?)` — uWebSockets.js (C++ transport)

Routes are registered directly with uWS's C++ radix trie router — zero JS routing overhead per request. Requires `uWebSockets.js` as a peer dependency (it is published on GitHub, not npm):

```bash
pnpm add uNetworking/uWebSockets.js#v20.66.0
```

```typescript
const { port, server } = await app.nativeListen(3000);
// or with CORS:
await app.nativeListen({ port: 3000, cors: { origin: '*' } });
```

### `app.listenSsr(port, config)` — Unified API + SSR

Single server for both API routes and Vite-powered SSR pages. See [SSR Integration](#ssr-integration).

```typescript
await app.listenSsr(3000, {
  root: './web',
  entryServer: 'src/entry-server.tsx',
});
```

---

## Route Registration

Register routes with `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`. Each accepts an optional schema object for validation.

```typescript
// No schema — handler only
app.get('/health', () => ({ status: 'ok' }));

// With schema — body, query, params, response
app.post('/users', {
  body: z.object({ name: z.string(), email: z.string().email() }),
  response: z.object({ id: z.string().uuid(), name: z.string() }),
}, (ctx) => {
  return { id: uuid(), name: ctx.body.name };
});
```

The handler context `ctx` contains:

| Property | Type | Description |
|----------|------|-------------|
| `ctx.body` | Inferred from `schema.body` | Validated request body (POST/PUT/PATCH) |
| `ctx.query` | Inferred from `schema.query` | Validated query parameters |
| `ctx.params` | Inferred from `schema.params` | Validated path parameters |
| `ctx.services` | `TServices` | Injected services |
| `ctx.json(data, status?)` | `Response` | Return JSON response |
| `ctx.text(data, status?)` | `Response` | Return text response |
| `ctx.html(data, status?)` | `Response` | Return HTML response |
| `ctx.req` | `HonoRequest` | Raw Hono request |

Handlers can return a plain object (auto-serialized as JSON) or a `Response` object for full control.

---

## Route Groups

Group routes under a common prefix:

```typescript
app.group('/api/v1', (r) => {
  r.get('/users', (ctx) => listUsers());
  r.get('/users/:id', { params: uuidParams }, (ctx) => getUser(ctx.params.id));
  r.post('/users', { body: CreateUserSchema }, (ctx) => createUser(ctx.body));
});
// Registers: GET /api/v1/users, GET /api/v1/users/:id, POST /api/v1/users
```

---

## Schema Validation

Kozo uses Zod natively — no AJV, no JSON Schema intermediate step. Schemas are compiled once at route registration.

```typescript
app.post('/users', {
  body: z.object({
    email: z.string().email(),
    name: z.string().min(2).max(50),
    age: z.number().min(18),
  }),
  query: z.object({
    dryRun: z.coerce.boolean().optional(),
  }),
  params: z.object({
    orgId: z.string().uuid(),
  }),
  response: UserSchema,         // bare schema -> normalized to { 200: UserSchema }
  // or: response: { 200: UserSchema, 201: CreatedSchema }
}, handler);
```

Invalid requests return RFC 7807 `application/problem+json`:

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

### Response schema = contract (read this)

When you set `response` on a route, Kozo treats it as the **public API contract**, not just typing sugar:

- **Compiled serialization** — if the schema maps to JSON Schema (`z.object`, primitives, arrays, …), Kozo compiles a `fast-json-stringify` serializer **once at route registration**. Schemas with `.transform()`, `z.date()`, or `z.any()` use `JSON.stringify` instead (safe fallback — no silent wrong compile).
- **Undeclared fields are dropped** — extra properties on the handler return value (e.g. DB columns not in the schema) are **omitted from the JSON response**. This is intentional contract enforcement: declare everything you return, or remove `response` from the route if you want pass-through serialization.

```typescript
app.get('/users/:id', {
  params: z.object({ id: z.string() }),
  response: z.object({ id: z.string(), name: z.string() }), // only these two keys in JSON
}, ({ params, services }) => services.db.findUser(params.id));
// If the DB row has `{ id, name, email, createdAt }`, the client receives `{ id, name }` only.
```

---

## Services (Dependency Injection)

Pass typed services at construction — every handler receives them via `ctx.services`:

```typescript
interface AppServices {
  db: Database;
  cache: RedisClient;
  stripe: Stripe;
}

const app = createKozo<AppServices>({
  services: { db, cache, stripe },
});

app.get('/users', (ctx) => {
  // ctx.services.db is fully typed as Database
  return ctx.services.db.users.findMany();
});
```

---

## Guards (security — single source of truth)

`app.guard(pattern, fn)` registers a transport-agnostic check: it runs as Hono
middleware under `listen()` and **compiled into the uWS fast path** under
`nativeListen()` — identical semantics, native speed. Use guards for auth,
roles, and rate limits.

```typescript
import { rateLimitGuard, requireSecret } from '@kozojs/core';
import { jwtGuard, roleGuard } from '@kozojs/auth';

app.guard('/api/*', jwtGuard(requireSecret('JWT_SECRET'), { publicPaths: ['/api/health'] }));
app.guard('/api/admin/*', roleGuard('admin'));
app.guard('/api/auth/*', rateLimitGuard({ max: 20, window: 60 }));

// Custom guard: allow (return nothing), attach user, or deny
app.guard('/internal/*', (req) => {
  if (req.header('x-api-key') !== process.env.API_KEY) {
    return { deny: { status: 401, body: { error: 'invalid api key' } } };
  }
});
```

CORS is handled at the transport level (preflight included):

```typescript
await app.nativeListen({ port: 3000, cors: { origin: ['https://app.com'], credentials: true } });
```

---

## Middleware

Register Hono middleware globally or per-path:

```typescript
import { logger, errorHandler } from '@kozojs/core/middleware';

app.middleware(logger());        // request logging
app.middleware(errorHandler());  // error handler (RFC 7807)

// Custom middleware (needs the Hono Context)
app.middleware('/admin/*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  return next();
});
```

> Under `nativeListen()`, routes covered by middleware patterns are served
> through the Hono bridge to guarantee correctness (~35% slower than the
> native path). Prefer `app.guard()` for security checks — it stays native.
> Versions ≤ 0.5.15 silently **bypassed** middleware under `nativeListen()`;
> upgrade to ≥ 0.5.16.
>
> **Native transport limits** (multipart, streaming/SSE on bridged routes, HTTPS):
> see [Common Pitfalls §12](../../docs/common-pitfalls.md#12-native-transport-limits-nativelisten--uws).

### Built-in Middleware

| Middleware | Import | Options |
|-----------|--------|---------|
| `logger(options?)` | `@kozojs/core/middleware` | `prefix?: string`, `colorize?: boolean` |
| `cors(options?)` | `@kozojs/core/middleware` | `origin`, `allowMethods`, `allowHeaders`, `maxAge`, `credentials` |
| `rateLimit(options)` | `@kozojs/core/middleware` | `max`, `window` (seconds), `keyGenerator?`, `store?` (Redis etc.) |
| `errorHandler()` | `@kozojs/core/middleware` | Catches `KozoError` -> RFC 7807 response |

---

## Error Handling (RFC 7807)

All errors follow [RFC 7807 Problem Details](https://www.rfc-editor.org/rfc/rfc7807). Throw any `KozoError` subclass and it becomes a structured response.

```typescript
import {
  KozoError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  GoneError,
  ValidationFailedError,
} from '@kozojs/core';

app.get('/users/:id', { params: uuidParams }, (ctx) => {
  const user = db.users.find(ctx.params.id);
  if (!user) throw new NotFoundError();        // -> 404
  if (!canAccess(user)) throw new ForbiddenError('Insufficient permissions'); // -> 403
  return user;
});
```

**Error classes:**

| Class | Status | Default Message |
|-------|--------|-----------------|
| `KozoError` | any | (custom) |
| `BadRequestError` | 400 | "Bad Request" |
| `UnauthorizedError` | 401 | "Unauthorized" |
| `ForbiddenError` | 403 | "Forbidden" |
| `NotFoundError` | 404 | "Resource Not Found" |
| `ConflictError` | 409 | "Conflict" |
| `GoneError` | 410 | "Gone" |
| `ValidationFailedError` | 400 | (custom, includes `.errors` array) |

**Pre-built response helpers** (zero-allocation hot path):

```typescript
import {
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
  validationErrorResponse,
} from '@kozojs/core';
```

---

## Graceful Shutdown

Kozo drains in-flight requests before closing. No request is dropped mid-flight.

```typescript
await app.listen(3000);

// Later (e.g. on SIGTERM):
await app.shutdown({
  timeoutMs: 30000,
  onShutdownStart: (inflight) => console.log('Draining ' + inflight + ' requests'),
  onShutdownComplete: () => console.log('Clean exit'),
});
```

**Full lifecycle control via `ShutdownManager`:**

```typescript
const manager = app.getShutdownManager();

// Register database cleanup
manager.setDatabase(db, 'postgresql'); // also: 'mysql', 'sqlite'

// Custom cleanup hooks (run after draining, before DB close)
manager.addCleanupHook(async () => {
  await cache.quit();
  await queue.close();
});

// Wire to process signals
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());
```

During shutdown:
1. New requests -> `503 Service Unavailable`
2. In-flight requests -> allowed to complete (up to `timeoutMs`)
3. Cleanup hooks run
4. Database connections closed
5. Server closed

---

## Type-Safe Client Generation

Generate a fully typed TypeScript client from your routes:

```typescript
const code = app.generateClient({
  baseUrl: 'https://api.example.com',
  includeValidation: true,    // embed Zod schemas for client-side validation
  validateByDefault: false,   // opt-in per request
});

writeFileSync('./client/api.ts', code);
```

**Generated client usage:**

```typescript
import { KozoClient } from './client/api';

const api = new KozoClient({ baseUrl: 'https://api.example.com' });

const users = await api.users({ page: 1 });
//    ^? User[]

const user = await api.postUsers({ name: 'Jane', email: 'jane@example.com' });
//    ^? { id: string, name: string }
```

Options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `''` | API base URL |
| `includeValidation` | `boolean` | `true` | Include Zod schemas in output |
| `validateByDefault` | `boolean` | `false` | Enable validation in client constructor |
| `defaultHeaders` | `Record&lt;string, string&gt;` | `{}` | Default request headers |

---

## OpenAPI Generation

Mount Swagger UI and an OpenAPI 3.1 document from registered routes:

```typescript
app.mountDocs({
  title: 'My API',
  version: '1.0.0',
  servers: [{ url: 'https://api.example.com' }],
});
```

- Swagger UI: `/docs`
- OpenAPI JSON: `/docs.json`

Outside production the routes are enabled by default. In production, opt in explicitly:

```typescript
app.mountDocs({
  title: 'My API',
  version: '1.0.0',
  enabled: process.env.ENABLE_API_DOCS === 'true',
});
```

For custom spec pipelines, use `createOpenAPIGenerator()` directly. `generateSwaggerHtml(specUrl, title?)` accepts the URL of an OpenAPI document, not the document object.

Schemas are converted via Zod v4 native `z.toJSONSchema()`. Supported route metadata includes path params, query params, request bodies, response schemas, tags, Bearer auth, and summaries.

---

## File-System Routing

Auto-register routes from the file system:

```typescript
const app = createKozo({ routesDir: './src/routes' });
await app.loadRoutes();
```

**Convention:**

| File | Route |
|------|-------|
| `routes/users.ts` | GET/POST `/users` |
| `routes/users/[id].ts` | GET/PUT/DELETE `/users/:id` |
| `routes/_middleware.ts` | Skipped (prefixed with `_`) |
| `routes/users.test.ts` | Skipped (test file) |

Each route file exports a default handler and optional `schema`/`meta`:

```typescript
// routes/users/[id].ts
import { z } from 'zod';

export const schema = {
  params: z.object({ id: z.string().uuid() }),
  response: UserSchema,
};

export const meta = { auth: true, tags: ['users'] };

export default (ctx) => {
  return ctx.services.db.users.find(ctx.params.id);
};
```

**Programmatic API:**

```typescript
import { createFileSystemRouting, applyFileSystemRouting } from '@kozojs/core/middleware';
```

---

## WebSocket (uWS)

WebSocket support via uWebSockets.js native pub/sub. Requires `nativeListen()`.

```typescript
app.ws('/ws/chat', {
  open(ws) {
    ws.subscribe('chat');
  },
  message(ws, data) {
    ws.publish('chat', data);
  },
  close(ws) {
    console.log('disconnected');
  },
});

await app.nativeListen(3000);
```

**With typed user data and auth upgrade:**

```typescript
app.ws<{ userId: string }>('/ws/secure', {
  upgrade(req) {
    const userId = verifyToken(req.headers['authorization']);
    if (!userId) return false; // reject upgrade
    return { userId };         // attached as ws.data
  },
  open(ws) {
    console.log(ws.data.userId + ' connected');
    ws.subscribe('user:' + ws.data.userId);
  },
  message(ws, data) {
    ws.publish('user:' + ws.data.userId, data);
  },
});
```

> **Note:** `app.listen()` will warn if WebSocket routes are registered — use `app.nativeListen()` instead.

---

## SSR Integration

Unified API + Vite SSR from a single server. No separate frontend server or proxy.

```typescript
import path from 'node:path';
import { createKozo } from '@kozojs/core';

const app = createKozo({ routesDir: './src/routes' });
await app.loadRoutes();

await app.listenSsr(3000, {
  root: path.resolve('./web'),
  entryServer: 'src/entry-server.tsx',
  apiPrefix: '/api',
});
```

**How it works:** requests matching `apiPrefix` go to Hono, everything else -> Vite SSR pipeline.

- **Dev mode:** Vite middleware for HMR + optional SSR rendering (auto-detected)
- **Prod mode:** Static files from `dist/client/` + pre-built SSR from `dist/server/`

Supports React 18 streaming (`renderToPipeableStream`) and string rendering.

### SSR Config

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `root` | `string` | — | Web app root (where `index.html` lives) |
| `entryServer` | `string` | — | Server entry relative to `root` |
| `apiPrefix` | `string \| string[]` | `'/api'` | Routes that bypass SSR |
| `devSsr` | `boolean` | auto-detected | Enable SSR in dev mode |
| `template` | `string` | `'index.html'` | HTML template path |
| `appPlaceholder` | `string` | `&lt;!--app-html--&gt;` (default) | Placeholder for rendered HTML |
| `headPlaceholder` | `string` | `&lt;!--ssr-head--&gt;` (default) | Placeholder for head tags |
| `distClient` | `string` | `'dist/client'` | Built client assets |
| `distServer` | `string` | `'dist/server'` | Server bundle directory |

---

## Helper Schemas & Utilities

Common schemas to avoid repeating boilerplate:

```typescript
import {
  paginationSchema,  // { page: z.coerce.number().default(1), limit: ... }
  uuidParams,        // { id: z.string().uuid() }
  idParams,          // { id: z.coerce.number().int().positive() }
  timestamps,        // { createdAt: z.date(), updatedAt: z.date() }
  sortSchema,        // { sortBy?: string, sortOrder: 'asc' | 'desc' }
  searchSchema,      // { q?: string }
  successSchema,     // { success: boolean, message?: string }
  deletedSchema,     // { success: boolean, deletedId: string }
  uuid,              // () => string (crypto.randomUUID)
  paginate,          // (items, page, limit) -> PaginatedResult
  defineEnv,         // validate process.env with Zod at startup
} from '@kozojs/core';
```

**Environment validation:**

```typescript
const env = defineEnv({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});
// Throws at startup with clear message if any variable is missing/invalid
```

**Pagination:**

```typescript
app.get('/users', { query: paginationSchema }, (ctx) => {
  return paginate(allUsers, ctx.query.page, ctx.query.limit);
  // -> { data: [...], total, page, limit, totalPages, hasNext, hasPrev }
});
```

---

## Fast Response Utilities

Zero-allocation response helpers for custom native handlers:

```typescript
import {
  fastWriteJson,       // 200 JSON
  fastWriteText,       // 200 text/plain
  fastWriteHtml,       // 200 text/html
  fastWriteJsonStatus, // JSON with custom status
  fastWrite404,        // pre-built 404
  fastWrite500,        // pre-built 500
  fastWrite400,        // validation error
  fastWriteError,      // KozoError -> problem+json
} from '@kozojs/core';
```

---

## Runtime Compatibility

```typescript
// Standard Node.js HTTP
await app.listen(3000);

// Node.js + optional uWebSockets.js dependency
await app.nativeListen(3000);

// Fetch API integration; confirm compatibility in your target adapter
export default { fetch: app.fetch };
```

---

## API Reference

### `createKozo&lt;TServices&gt;(config?)`

Create a Kozo application.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `services` | `TServices` | `{}` | Dependency injection container |
| `routesDir` | `string` | — | Directory for file-system routing |
| `maxBodyBytes` | `number` | `1048576` | Max request body size — larger requests get a 413 |
| `logger` | `boolean` | `true` | Set `false` to silence the startup banner (tests, benchmarks) |

### Instance Methods

| Method | Description |
|--------|-------------|
| `.get(path, schema?, handler)` | Register a GET route |
| `.post(path, schema?, handler)` | Register a POST route |
| `.put(path, schema?, handler)` | Register a PUT route |
| `.patch(path, schema?, handler)` | Register a PATCH route |
| `.delete(path, schema?, handler)` | Register a DELETE route |
| `.group(prefix, fn)` | Group routes under a prefix |
| `.ws(path, handler)` | Register a WebSocket route (requires nativeListen) |
| `.middleware(path?, handler)` | Register Hono middleware |
| `.use(plugin)` | Install a plugin |
| `.listen(port?)` | Start Node.js HTTP server (default: 3000) |
| `.nativeListen(port?)` | Start uWebSockets.js server |
| `.listenSsr(port, config)` | Start unified API + SSR server |
| `.loadRoutes(dir?)` | Load routes from file system |
| `.shutdown(options?)` | Graceful shutdown |
| `.generateClient(options?)` | Generate typed client SDK |
| `.mountDocs(options?)` | Mount Swagger UI and an OpenAPI 3.1 document |
| `.getRoutes()` | Inspect registered routes |
| `.getShutdownManager()` | Access shutdown manager |
| `.getApp()` | Access underlying Hono instance |
| `.fetch` | Hono fetch handler (for Workers/Deno) |

### Exports Map

```typescript
import { ... } from '@kozojs/core';           // main exports
import { ... } from '@kozojs/core/middleware'; // middleware
```

---

## License

MIT
