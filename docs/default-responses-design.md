# Default response maps: 0.7.1 design decision

An opt-in router-level `defaultResponses` API was evaluated for 0.7.1 and is deferred
until the runtime owns a single schema-compatible automatic error contract.

Today automatic responses are not one uniform family:

- validation and 413 responses use RFC 7807-shaped bodies;
- guards may intentionally return application-defined bodies;
- the current rate-limit middleware and guard use an `{ error }` body;
- internal errors and not-found responses are generated outside individual handlers.

Blindly merging one default response map into every route would make TypeScript and
OpenAPI claim schemas that the runtime does not always produce. It could also widen
existing client unions, which is observable even if runtime behavior is unchanged.

The future API may be introduced only when all of these are demonstrated together:

1. it is opt-in and leaves `createRouter()` with no options unchanged;
2. route response maps override defaults deterministically by status;
3. runtime validation, guards, limits, rate limiting, and internal errors emit the
   same declared schema or allow an explicit per-source override;
4. OpenAPI, generated clients, contract test clients, Hono, and native transport have
   parity tests for 400/401/403/413/429/500;
5. type tests prove existing route unions are unchanged unless the option is used.

For 0.7.1, applications must declare business statuses per route and treat automatic
statuses as a documented static-typing boundary. Generated clients continue to throw
`KozoUnexpectedResponseError` when a server returns an undeclared status.
