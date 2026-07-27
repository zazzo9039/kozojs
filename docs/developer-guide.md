# Developer Guide

Complete API reference for all Kozo packages.

---

## @kozojs/core

### `createKozo<TServices>(config?)`

Creates a new Kozo application instance.

```typescript
import { createKozo } from '@kozojs/core';

const app = createKozo<{ db: Database }>({
  routesDir: './src/routes',
  services: { db },
  onStart: async ({ services }) => { /* initialization */ },
  onStop: async ({ services }) => { /* cleanup */ },
});
```

**Config options:**

| Option | Type | Description |
|---|---|---|
| `routesDir` | `string` | Path to file-system routes directory |
| `services` | `TServices` | Services injected into every handler |
| `port` | `number` | Default port (3000) |
| `basePath` | `string` | URL base path prefix |
| `onStart` | `(ctx) => void` | Called after server starts |
| `onStop` | `(ctx) => void` | Called before server shuts down |
| `openapi` | `OpenAPIConfig` | OpenAPI/Swagger configuration |
| `onError` | `(error, ctx) => any` | Global error handler override |

### Route Registration

#### File-System Routing (recommended)

```typescript
await app.loadRoutes();        // scans routesDir
await app.loadRoutes('./src/routes'); // explicit path
```

`loadRoutes()` also discovers `_middleware.ts` files and registers them as scoped middleware.

#### Manual Registration

```typescript
app.get('/health', (ctx) => ctx.json({ ok: true }));

app.post('/users', {
  body: z.object({ name: z.string() }),
  response: UserSchema,
}, async (ctx) => {
  return ctx.json(await createUser(ctx.body));
});
```

#### Route Groups

```typescript
app.group('/users', (r) => {
  r.get('/', listUsers);
  r.get('/:id', getUser);
  r.post('/', createUser);
});
```

### Guards (security)

`app.guard(pattern, fn)` is the single source of truth for auth, roles, and rate
limits — the same check runs on `listen()` and `nativeListen()` (compiled into
the uWS fast path):

```typescript
import { rateLimitGuard, requireSecret } from '@kozojs/core';
import { jwtGuard, roleGuard } from '@kozojs/auth';

app.guard('/api/*', jwtGuard(requireSecret('JWT_SECRET')));
app.guard('/api/admin/*', roleGuard('admin'));
app.guard('/api/auth/*', rateLimitGuard({ max: 20, window: 60 }));
```

### Middleware

#### Global Middleware

```typescript
import { logger } from '@kozojs/core';

app.middleware(logger());
```

Under `nativeListen()`, routes covered by middleware patterns are Hono-bridged
(correct but slower) — keep security in guards.

#### Per-Directory Middleware

Create `_middleware.ts` files in route directories:

```typescript
// src/routes/api/_middleware.ts
// Applies to all /api/* routes — Hono middleware (needs the Hono Context)
export default async (c, next) => {
  c.header('x-request-id', crypto.randomUUID());
  await next();
};
```

Middleware execution order follows directory depth (root → leaf).

### Server

```typescript
// Hono + @hono/node-server (default)
await app.listen(3000);

// uWebSockets.js (maximum performance)
await app.nativeListen(3000);
await app.nativeListen({ port: 3000, cors: { origin: '*' } });

// SSR (API + Vite frontend)
await app.listenSsr(3000, {
  root: '../web',
  entryServer: 'src/entry-server.tsx',
});
```

### WebSocket

Requires `nativeListen()` with uWebSockets.js:

```typescript
app.ws('/ws/chat', {
  open(ws) { ws.subscribe('chat'); },
  message(ws, data) { ws.publish('chat', data); },
  close(ws) { console.log('disconnected'); },
});

// With auth and typed data
app.ws<{ userId: string }>('/ws/secure', {
  upgrade(req) {
    const userId = verifyToken(req.headers['authorization']);
    return userId ? { userId } : false; // false = reject
  },
  open(ws) { console.log(ws.data.userId, 'connected'); },
});
```

### Client SDK Generation

```typescript
const clientCode = app.generateClient('http://localhost:3000');
// Writes a fully-typed TypeScript client with fetch wrappers
```

The generated module exposes a route-tree factory:

```typescript
import { createKozoClient } from './generated/api.js';

const api = createKozoClient();
const result = await api.users.$id.get({
  params: { id: 'user-1' },
});

if (result.status === 200) {
  result.body.name;
} else if (result.status === 404) {
  result.body.message;
}
```

Declared statuses are returned as discriminated results. Unexpected statuses
throw `KozoUnexpectedResponseError`. The generated `KozoClient` class retains
deprecated flat methods for migration from earlier SDKs.

### OpenAPI / Swagger

```typescript
import { createOpenAPIGenerator, generateSwaggerHtml } from '@kozojs/core';

const generator = createOpenAPIGenerator({
  info: { title: 'My API', version: '1.0.0' },
});

app.get('/docs', (ctx) => ctx.html(generateSwaggerHtml('/openapi.json')));
app.get('/openapi.json', (ctx) => ctx.json(generator.generate(app.getRoutes())));
```

### Error Handling

Kozo uses [RFC 7807 Problem Details](https://datatracker.ietf.org/doc/html/rfc7807):

```typescript
import { NotFoundError, ForbiddenError, BadRequestError } from '@kozojs/core';

export default async ({ params, services: { db } }) => {
  const user = await db.users.findById(params.id);
  if (!user) throw new NotFoundError('User not found');
  return user;
};
```

Available error classes: `ValidationFailedError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `GoneError`, `BadRequestError`.

All errors include:
- `type` — documentation URL with error code
- `title` — human-readable error name
- `status` — HTTP status code
- `detail` — error message

---

## @kozojs/auth

JWT authentication guards.

```typescript
import { requireSecret } from '@kozojs/core';
import { registerAuthGuard, jwtGuard, roleGuard } from '@kozojs/auth';

// Recommended with file-system routes + meta.auth
await registerAuthGuard(app, requireSecret('JWT_SECRET'), {
  routesDir: './src/routes',
  prefix: '/api',
});
app.guard('/api/admin/*', roleGuard('admin'));
await app.loadRoutes();

// Or a manual guard:
app.guard('/api/*', jwtGuard(requireSecret('JWT_SECRET'), { publicPaths: ['/api/health'] }));
```

The authenticated user is available as `ctx.user` in handlers.

---

## @kozojs/db

Drizzle ORM integration.

```typescript
import { createDb } from '@kozojs/db';

const db = createDb({
  provider: 'postgres',
  url: process.env.DATABASE_URL,
});
```

---

## @kozojs/cli

CLI tool for project scaffolding and development.

```bash
# Create new project
npx @kozojs/cli new my-app

# Development server with hot route reload
kozo dev

# Build with manifest generation
kozo build

# Generate route or middleware
kozo generate route users/profile
kozo g middleware auth
kozo g service email
```

---

## @kozojs/testing

Use the route-derived client for positive contract tests. Its path tree,
request fields, response status, and JSON body come from the static route
contract:

```typescript
import { createKozo, createRouter, z } from '@kozojs/core';
import { createContractTestClient } from '@kozojs/testing';

const routes = createRouter()
  .get('/:id', {
    params: z.object({ id: z.string() }),
    response: { 200: UserSchema, 404: ErrorSchema },
  }, ({ params, services, json }) => {
    const user = services.db.find(params.id);
    return user ? json(user, 200) : json({ message: 'Not found' }, 404);
  });

const app = createKozo({ services: { db: mockDb } }).mount('/users', routes);
const client = createContractTestClient(app);
const response = await client.users.$id.get({ params: { id: 'user-1' } });
```

Use `createTestClient(app)` for intentionally invalid requests and unknown
paths. It accepts raw string URLs and runs in process through `app.fetch()`.
`createNativeContractTestClient(app)` and `createNativeTestClient(app)` run the
same two APIs against a real `nativeListen()` server; always close them:

```typescript
import { createNativeContractTestClient } from '@kozojs/testing';

const client = await createNativeContractTestClient(app);
try {
  const response = await client.users.$id.get({ params: { id: 'user-1' } });
} finally {
  await client.close();
}
```

Static types are retained through fluent return values or
`createRouter().mount()`. Routes discovered dynamically at runtime use the raw
client unless an explicit static contract is exported and mounted.

---

## Schema Helpers

Kozo exports common schema patterns to reduce boilerplate:

```typescript
import { paginationSchema, uuidParams, idParams, timestamps } from '@kozojs/core';

export const schema = {
  query: paginationSchema,     // { page, limit, offset }
  params: uuidParams,          // { id: z.string().uuid() }
};
```
