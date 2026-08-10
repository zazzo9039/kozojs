# Migrating to feature modules

Migration from a 0.7.0 application is incremental and non-breaking.

1. Choose one cohesive endpoint group.
2. Move its schemas to `<feature>.contract.ts` without changing paths or payloads.
3. Extract domain behavior into `<feature>.service.ts` using plain values.
4. Express its public routes with `createRouter<AppServices>()`.
5. Export the router and service types from `index.ts`.
6. Mount the router at the existing prefix from the composition root.
7. Add contract, raw-negative, and transport-sensitive native tests.

File-system routes can coexist during migration. Only statically created and mounted
route contracts contribute to the compile-time route union used by typed clients.

## Error payloads during migration

New Golden Path features should declare RFC 7807 Problem Details. Existing Nest-style
`{ statusCode, message, error }` responses can stay declared in the contract response
map until callers migrate — see [Contracts and errors](./contracts-and-errors.md).

## Contract typing pitfalls to fix early

- Replace `z.date()` with ISO `z.string()` (optionally via `z.preprocess`) so OpenAPI
  and serializers stay valid.
- Prefer `z.boolean()` over `z.literal(true)` when services return a plain `boolean`.
