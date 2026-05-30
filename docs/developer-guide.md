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

### Middleware

#### Global Middleware

```typescript
import { cors, logger, rateLimit } from '@kozojs/core';

app.middleware(logger());
app.middleware(cors({ origin: '*' }));
app.middleware('/api/*', rateLimit({ max: 100, window: 60_000 }));
```

#### Per-Directory Middleware

Create `_middleware.ts` files in route directories:

```typescript
// src/routes/admin/_middleware.ts
// Applies to all /admin/* routes
export default async (c, next) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
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

JWT authentication middleware.

```typescript
import { registerAuthBeforeLoadRoutes, authenticateJWT } from '@kozojs/auth';

// Recommended with file-system routes + _middleware.ts
await registerAuthBeforeLoadRoutes(app, process.env.JWT_SECRET!, {
  routesDir: './src/routes',
  prefix: '/api',
});
await app.loadRoutes();

// Or manual middleware:
app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!));
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

In-process testing without opening network ports.

```typescript
import { createTestApp } from '@kozojs/testing';

const client = await createTestApp({ services: { db: mockDb } });

const res = await client.get('/users');
expect(res.status).toBe(200);

const data = await res.json();
expect(data).toHaveLength(3);
```

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
