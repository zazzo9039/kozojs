<p align="center">
  <a href="https://github.com/zazzo9039/kozojs">
    <img src="https://raw.githubusercontent.com/zazzo9039/kozojs/main/assets/brand/kozo-banner.jpg" alt="Kozo — TypeScript backend framework: Routes · Validation · OpenAPI · Generated Client" width="960">
  </a>
</p>

# @kozojs/testing

Test a Kozo application through its route contract or through a low-level HTTP
interface. Both APIs can run in process; native variants exercise a real
uWebSockets.js server on an ephemeral port.

## Install

```bash
npm install -D @kozojs/testing
```

## Contract-aware tests

Use `createRouter()` and `mount()` so the app carries its route union in its
TypeScript type:

```typescript
import { createKozo, createRouter, z } from '@kozojs/core';
import { createContractTestClient } from '@kozojs/testing';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const users = createRouter()
  .post('/', {
    body: z.object({ name: z.string() }),
    response: { 201: UserSchema },
  }, ({ body, json }) => json({ id: 'user-1', ...body }, 201))
  .get('/:id', {
    params: z.object({ id: z.string() }),
    headers: z.object({ authorization: z.string() }),
    response: {
      200: UserSchema,
      404: z.object({ message: z.string() }),
    },
  }, ({ params, json }) => json({ id: params.id, name: 'Ada' }, 200));

const app = createKozo().mount('/users', users);
const client = createContractTestClient(app);

const created = await client.users.post({
  body: { name: 'Ada' },
});
//    ^ status: 201; json(): { id: string; name: string }

const detail = await client.users.$id.get({
  params: { id: created.json().id },
  headers: { authorization: 'Bearer test-token' },
});

if (detail.status === 200) {
  detail.json().name; // string
} else {
  detail.json().message; // string
}
```

The route tree uses readable segments:

- `/users/:id` becomes `client.users.$id`.
- `/user-profiles` becomes `client.userProfiles`.
- HTTP methods are terminal lowercase functions such as `.get()` and `.post()`.

Generated SDKs use the same shape through `createKozoClient()`, so a contract
test written against `client.users.$id.get(...)` maps directly to
`api.users.$id.get(...)` in application code.

Inputs use Zod's input type, so coercible values remain valid at the call site.
Responses use Zod's output type. A numeric response map produces a
status-discriminated union.

### The static typing boundary

TypeScript cannot inspect a private runtime route registry while compiling a
consumer. The contract must therefore be retained through a returned value:

```typescript
const app = createKozo()
  .get('/health', { response: HealthSchema }, handler);

// Or compose a reusable module:
const app = createKozo().mount('/users', userRoutes);
```

This remains valid at runtime, but its ignored return value cannot enrich the
existing variable's type:

```typescript
const app = createKozo();
app.get('/health', handler);
```

File-system and plugin routes are also discovered dynamically. Test them with
the raw client, or export and mount an explicit static contract alongside their
runtime registration.

## Raw in-process tests

`createTestClient(app)` accepts string paths and arbitrary inputs. It is the
right tool for malformed payloads, missing headers, unknown routes and other
tests that intentionally violate the contract:

```typescript
import { createTestClient } from '@kozojs/testing';

const client = createTestClient(app);
const response = await client.post('/users', {
  name: '',
  unexpected: true,
});

expect(response.status).toBe(400);
```

`createTestApp(config?)` creates an app and exposes the same raw methods in one
call:

```typescript
import { createTestApp } from '@kozojs/testing';

const { app, get, post } = createTestApp({
  services: { db: mockDb },
});
```

## Native transport tests

`createNativeContractTestClient(app)` exposes the typed route tree over real
HTTP. `createNativeTestClient(app)` exposes the raw API:

```typescript
import { createNativeContractTestClient } from '@kozojs/testing';

const client = await createNativeContractTestClient(app);
try {
  const response = await client.users.$id.get({
    params: { id: 'user-1' },
    headers: { authorization: 'Bearer test-token' },
  });
} finally {
  await client.close();
}
```

Both require the optional `uWebSockets.js` dependency. Always call `close()` in
`finally`, `afterEach`, or `afterAll`.

## Low-level request API

The raw clients expose `get`, `post`, `put`, `patch`, `delete`, and `inject`.
`inject` provides complete request control:

```typescript
const response = await client.inject({
  method: 'POST',
  url: '/users',
  headers: { authorization: 'Bearer token123' },
  body: { name: 'Alice' },
  query: {
    page: 2,
    active: false,
    tag: ['new', 'staff'],
  },
});
```

Query values may be strings, numbers, booleans, or arrays of those primitives.
Arrays use repeated query keys. `null` and `undefined` are omitted; `0`, `false`
and empty strings are preserved.

Plain objects, arrays, numbers, and booleans are JSON-serialized and receive an
`application/json` content type by default. Strings remain raw.
`URLSearchParams`, `FormData`, `Blob`, `ArrayBuffer`, and typed arrays pass
through to the Fetch `Request`. An explicit `content-type` header always wins.

## Response shape

All clients return:

| Property | Type | Description |
|---|---|---|
| `status` | `number` or declared status union | HTTP status |
| `headers` | `Headers` | Response headers |
| `body` | `string` | Raw response body |
| `ok` | `boolean` or status-derived literal | Whether the status is 2xx |
| `json()` | Contract output or caller-selected type | Parsed JSON body |

## Complete example

The runnable
[`examples/contract-showcase`](../../examples/contract-showcase/README.md)
covers typed services, guards, response stripping, OpenAPI, SDK generation,
raw negative tests, and a native smoke test.

## License

MIT
