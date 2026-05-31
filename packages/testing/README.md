# @kozojs/testing

In-process test client for [Kozo](https://github.com/zazzo9039/kozojs) framework — no HTTP server required.

## Install

```bash
npm install -D @kozojs/testing
```

## Quick Start

```typescript
import { createKozo, z } from '@kozojs/core';
import { createTestClient } from '@kozojs/testing';

const app = createKozo();
app.get('/ping', {}, () => ({ pong: true }));

const client = createTestClient(app);
const res = await client.get('/ping');

expect(res.status).toBe(200);
expect(res.json()).toEqual({ pong: true });
```

## API

### `createTestClient(app)`

Wrap an existing Kozo app. Routes are invoked in-memory via `app.fetch()` — no port is opened.

```typescript
const client = createTestClient(app);

// All HTTP methods available
await client.get('/users');
await client.post('/users', { name: 'Alice', email: 'alice@example.com' });
await client.put('/users/1', { name: 'Bob' });
await client.patch('/users/1', { name: 'Charlie' });
await client.delete('/users/1');
```

### `createTestApp(config?)`

Create a Kozo app **and** client in one call — ideal for tests.

```typescript
import { z } from '@kozojs/core';
import { createTestApp } from '@kozojs/testing';

const { app, get, post } = createTestApp();

app.post('/users', {
  body: z.object({ name: z.string(), email: z.string().email() }),
}, ({ body }) => ({ id: 1, ...body }));

const res = await post('/users', { name: 'Alice', email: 'alice@example.com' });
expect(res.status).toBe(200);
expect(res.json()).toMatchObject({ name: 'Alice' });
```

### `inject(options)`

Low-level request with full control:

```typescript
const res = await client.inject({
  method: 'POST',
  url: '/users',
  headers: { Authorization: 'Bearer token123' },
  body: { name: 'Alice' },
  query: { expand: 'profile' },
});
```

## Response Object

| Property | Type | Description |
|---|---|---|
| `status` | `number` | HTTP status code |
| `headers` | `Headers` | Response headers (Web API) |
| `body` | `string` | Raw response body as text |
| `ok` | `boolean` | `true` if status is 200–299 |
| `json<T>()` | `T` | Parse body as JSON |

## Validation Errors

Structured Zod validation errors are returned as 400 responses:

```typescript
const res = await post('/users', { name: 'Alice', email: 'not-an-email' });
expect(res.status).toBe(400);
expect(res.json()).toMatchObject({
  status: 400,
  title: 'Validation Failed',
  errors: [{ field: 'email', code: 'invalid_string', message: expect.any(String) }],
});
```

## Services

Works seamlessly with typed services:

```typescript
const { app, get } = createTestApp<{ db: Database }>({
  services: { db: mockDb },
});

app.get('/users', {}, ({ services }) => services.db.getUsers());
```

## License

MIT
