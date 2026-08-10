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

## Growing a service past ~250 lines

`kozo check` warns with `KOZO_ARCH101` when a route or service file exceeds 250 lines.
That warning is a signal to split cohesive work, not a hard failure.

A practical split for CRUD-heavy features is **query vs mutate**:

```text
src/modules/trips/
  trips.contract.ts
  trips.routes.ts
  trips.test.ts
  index.ts
  services/
    list-trips.ts      # reads / queries
    get-trip.ts
    create-trip.ts     # writes / mutations
    update-trip.ts
    delete-trip.ts
```

Keep the public `createTripsService()` (or individual use-case factories) as the
composition surface injected through `AppServices`. Split only when the single
service file becomes hard to review or test; do not atomize every one-liner.

## Progressive complexity

1. Four-file feature (contract, service, routes, test).
2. Multiple use-case files under `services/` when the surface grows.
3. `domain/` + `repositories/` only when persistence mapping or replaceable storage
   justifies the extra boundary.

`examples/contract-showcase` is the canonical runnable example.
