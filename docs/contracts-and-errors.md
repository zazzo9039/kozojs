# Contracts and errors

Every Golden Path route declares concrete public response schemas. The declaration is
the source for runtime response stripping, OpenAPI, generated clients, and contract
tests.

## Error format: RFC 7807

The Golden Path standard is RFC 7807 Problem Details (`application/problem+json`):

```ts
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string().optional(),
});
```

### Legacy Nest-style errors (compat mode)

If an existing consumer still returns `{ statusCode, message, error }`, declare that
shape in the route response map and keep serving it until you migrate. Compatibility
is application-level: Kozo does not convert Nest payloads automatically, and new
Golden Path features should prefer Problem Details.

```ts
export const LegacyHttpExceptionSchema = z.object({
  statusCode: z.number().int(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string(),
});

// route response map during migration
response: {
  200: UserSchema,
  404: LegacyHttpExceptionSchema, // temporary
}
```

## Response maps

Declare each business status explicitly. Automatic framework responses such as input
validation, guard denial, body limits, rate limits, and internal failures may occur
outside a route's declared response map in 0.7.0. Generated SDKs can therefore raise
`KozoUnexpectedResponseError` for those statuses. Until an opt-in default response
map is implemented and verified across runtime, OpenAPI, generated clients, and test
clients, documentation must not claim that a route status union is exhaustive.

## Dates on the wire

OpenAPI serialization cannot represent JavaScript `Date` objects
(`Date cannot be represented in JSON Schema`). Public contracts must use ISO 8601
strings:

```ts
export const UserSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(), // ISO wire format
});
```

If a service or Prisma layer still returns `Date` instances at runtime, preprocess
before validating or serializing against the contract:

```ts
const toIso = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : value;

export const UserWireSchema = z.object({
  id: z.string(),
  createdAt: z.preprocess(toIso, z.string().datetime()),
});
```

`kozo check` emits warning `KOZO_ARCH104` when a `*.contract.ts` file uses `z.date()`.

## Booleans vs literals

Prefer `z.boolean()` in response contracts when services return a plain `boolean`
(for example Prisma/`success: true` inferred as `boolean`). A `z.literal(true)`
schema rejects a value typed only as `boolean` in contract tests and generated
clients.

```ts
// Prefer
response: { 200: z.object({ ok: z.boolean() }) }

// Or keep the literal and narrow the service return:
return { ok: true as const };
```

## Testing

Use `createContractTestClient` for valid typed calls and `createTestClient` for
deliberately malformed payloads. Add native tests for guard, CORS, and other behavior
that can differ by transport.
