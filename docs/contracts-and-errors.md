# Contracts and errors

Every Golden Path route declares concrete public response schemas. The declaration is
the source for runtime response stripping, OpenAPI, generated clients, and contract
tests.

Use RFC 7807 Problem Details for error responses:

```ts
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
});
```

Declare each business status explicitly. Automatic framework responses such as input
validation, guard denial, body limits, rate limits, and internal failures may occur
outside a route's declared response map in 0.7.0. Generated SDKs can therefore raise
`KozoUnexpectedResponseError` for those statuses. Until an opt-in default response
map is implemented and verified across runtime, OpenAPI, generated clients, and test
clients, documentation must not claim that a route status union is exhaustive.

Use `createContractTestClient` for valid typed calls and `createTestClient` for
deliberately malformed payloads. Add native tests for guard, CORS, and other behavior
that can differ by transport.
