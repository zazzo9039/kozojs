# ADR 0001: Feature-first modules with static contracts

- Status: accepted
- Target: Kozo 0.7.1
- Date: 2026-08-10

## Context

Kozo supports file-system routing and imperative route registration, but routes that
must feed OpenAPI, generated clients, and contract tests need a statically visible
route tree. Large applications also need a predictable dependency direction that
does not couple domain logic to HTTP or persistence libraries.

## Decision

The recommended production architecture is feature-first. Each public feature owns
its contract, service, routes, tests, and public barrel:

```text
src/modules/users/
  users.contract.ts
  users.service.ts
  users.routes.ts
  users.test.ts
  index.ts
```

Public routes use `createRouter<AppServices>()` and are mounted from the application
composition root. Contracts use the `z` export from `@kozojs/core`, declare concrete
response schemas for every intended public status, and use RFC 7807 Problem Details
for errors. Services accept plain typed values and injected dependencies; they do not
import `KozoContext`, Hono `Context`, `Response`, environment variables, or database
drivers.

Dependencies flow in one direction:

```text
bootstrap -> app -> feature routes -> feature services -> repositories/adapters
                     |                    |
                     +-> contracts <-----+
```

Cross-feature consumers import only from another feature's `index.ts`. Repositories
remain optional until shared queries, multiple adapters, or non-trivial persistence
mapping justify a stable port.

## Progressive complexity

- Start with contract, service, routes, test, and barrel.
- Add a repository only when persistence behavior needs an explicit boundary.
- Split files when a route or service exceeds 250 lines, or warn when a handler
  exceeds 15 logical lines.
- Use guards for auth, permissions, and transport-sensitive policy.
- Keep file routing available for applications that intentionally choose runtime
  discovery; it is not removed or renamed.

## Feature Definition of Done

A feature declares request and response schemas without `z.any()`, uses a static
router when typed consumers are required, keeps transport and persistence imports out
of services, has happy and negative paths, uses a raw test for deliberately invalid
input, adds native coverage for guards/CORS, exports only its public surface, and
passes lint, typecheck, tests, and `kozo check`.

## Consequences

The same route contract can drive runtime validation, response serialization,
OpenAPI, generated clients, and contract-aware tests. Existing applications remain
compatible: this is a recommended additive path, not a change to `createRouter()` or
file-system routing behavior.
