# Feature modules

Kozo's production Golden Path groups code by feature and keeps HTTP, domain logic,
and infrastructure boundaries explicit.

## Smallest useful feature

```text
src/modules/users/
  users.contract.ts  # Zod inputs and public response schemas
  users.service.ts   # domain behavior over plain values
  users.routes.ts    # short HTTP adapters
  users.test.ts      # service or contract behavior
  index.ts           # public feature surface
```

Mount the exported router in `src/app.ts`:

```ts
const app = createKozo<AppServices>({ services });
return app.mount('/users', usersRoutes);
```

Do not import another feature's private files. Export the smallest stable API from
its `index.ts` and import that barrel instead.

## Responsibilities

- Contracts define public input and output. Import `z` from `@kozojs/core`.
- Routes translate HTTP to service calls and serialize the declared status.
- Services contain domain rules and have no Kozo/Hono context or direct env access.
- Repositories are optional ports for non-trivial or replaceable persistence.
- Bootstrap validates environment once and injects immutable configuration/services.

`examples/contract-showcase` is the canonical runnable example.
