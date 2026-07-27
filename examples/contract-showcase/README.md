# Kozo contract showcase

This example is a small API whose route definitions are the single source of
truth for runtime validation, response serialization, OpenAPI, SDK generation
and type-safe tests.

## What it demonstrates

- `POST /users` validates input and removes `passwordHash` from the response.
- `GET /users/:id` derives path parameters and status-specific response types.
- `GET /users?page=&active=&tag=` serializes coercible values and repeated keys.
- `POST /projects` and `GET /projects/:id` use an injected, typed service.
- `GET /admin/stats` shares a bearer-token guard across Hono and native uWS.
- `/docs` and `/docs.json` are generated from the registered route schemas.
- `generated/api.ts` is generated from exactly the same route registry.

The storage layer is intentionally an in-memory mock, so the complete example
runs without a database or external service.

## Run it

From the repository root:

```bash
pnpm --filter kozo-contract-showcase test
pnpm --filter kozo-contract-showcase test:types
pnpm --filter kozo-contract-showcase generate
pnpm --filter kozo-contract-showcase dev
```

Then open `http://localhost:3000/docs`.

## The static contract

Routes are composed with `createRouter()` and mounted on the app:

```ts
const users = createRouter<AppServices>()
  .get('/:id', {
    params: z.object({ id: z.string() }),
    response: { 200: UserSchema, 404: ErrorSchema },
  }, ({ params, services, json }) => {
    const user = services.users.find(params.id);
    return user ? json(user, 200) : json({ message: 'Not found' }, 404);
  });

const app = createKozo<AppServices>({ services }).mount('/users', users);
const client = createContractTestClient(app);

const response = await client.users.$id.get({
  params: { id: 'user-1' },
});
```

TypeScript checks the path parameters before the test runs and narrows
`response.json()` from `response.status`.

The checked-in generated SDK exposes the same route shape:

```ts
import { createKozoClient } from './generated/api.js';

const api = createKozoClient({
  baseUrl: 'http://localhost:3000',
});

const result = await api.users.$id.get({
  params: { id: 'user-1' },
});

if (result.status === 200) {
  result.body.email; // string
} else {
  result.body.message; // string from the declared 404 schema
}
```

The generated route tree returns every declared status as data. A status not
present in the route contract throws `KozoUnexpectedResponseError`. Flat
methods such as `usersById()` remain in the generated `KozoClient` class as
deprecated migration aliases.

## Why there are two test clients

`createContractTestClient()` is the default for positive contract tests. It
derives its route tree, inputs and outputs from the app's static generic.

`createTestClient()` remains useful for malformed bodies, unknown routes and
other negative tests where the test must intentionally violate the contract.
Both clients run in process. Their native counterparts start `nativeListen()`
and make real HTTP requests.

## One important TypeScript rule

Type information is accumulated through returned values. Chain route calls or
mount a `createRouter()` contract. This runtime-compatible pattern does not add
the route to the resulting TypeScript type:

```ts
const app = createKozo();
app.get('/users', handler); // runtime route; returned type was ignored
```

Filesystem and other dynamically discovered routes have the same boundary:
they are available through the raw client unless the application also exports
and mounts an explicit static contract.
