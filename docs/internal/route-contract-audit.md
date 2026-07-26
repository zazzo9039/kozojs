# Route contract audit

Kozo already keeps one normalized runtime route list for manual and
filesystem routes. OpenAPI and client generation project from that list, while
the native transport keeps a compiled dispatch copy for performance.

| Consumer | Source | Fields used | Action |
|---|---|---|---|
| Fetch/Hono runtime | registration call | method, path, schemas, handler | keep |
| Native runtime | deferred compiled route | method, path, schemas, handler | keep and test parity |
| OpenAPI | `getRoutes()` | method, path, schemas, metadata | keep |
| Generated client | `getRoutes()` projection | method, path, schemas | keep |
| Contract testing | app route contract type plus `getRoutes()` | method, path, schemas | add |

The runtime list cannot provide compile-time inference to a consumer because
TypeScript resolves types before registered values exist. Contract-aware
tooling therefore uses a static route union carried by fluent route
registration or by `RouteContract`. Runtime execution continues to use the
existing route list.

Imperative registrations whose return value is ignored remain fully supported,
but they cannot change the already-declared type of an app variable. Dynamic
filesystem routes and plugins likewise remain available to low-level testing
unless they export or mount an explicit static contract.

Request headers were the only input schema missing from the shared route
shape. They are now validated by both compiled transports and projected into
OpenAPI and generated clients.
