# Common Pitfalls

Quick reference for mistakes that look like framework bugs but are usually configuration or ordering issues.

---

## 1. Security middleware doesn't run under `nativeListen()` (≤ 0.5.15)

**Symptom:** Routes protected by `app.middleware()` / `_middleware.ts` answer **without** auth or rate limits when the server starts with `nativeListen()`.

**Cause:** On core ≤ 0.5.15 the uWS transport served every route on the native fast path, silently bypassing the Hono middleware pipeline. Those versions are deprecated on npm.

**Fix:** Upgrade to ≥ 0.5.16 and use guards (`app.guard()` / `registerAuthGuard`) — they run on both transports, natively under uWS. Leftover middleware still works on ≥ 0.5.16 (covered routes are Hono-bridged) but costs ~35% throughput.

---

## 2. Auth runs after role guards → always 403

**Symptom:** Admin routes return `403 Forbidden` even with a valid JWT. `user.role` is undefined in the role check.

**Cause:** JWT registered **after** `loadRoutes()` (or after the role guard). Guards run in registration order — the role check executes **before** JWT decodes the token.

**Fix:** Use `registerAuthGuard()` **before** `loadRoutes()`, then `roleGuard`:

```typescript
import { requireSecret } from '@kozojs/core';

await registerAuthGuard(app, requireSecret('JWT_SECRET'), {
  routesDir: './src/routes',
  prefix: '',
});
app.guard('/api/admin/*', roleGuard('admin'));
await app.loadRoutes();
```

**Reference app:** **kozo-native-api** registers all guards in `registerApiSecurity()` before `loadRoutes()`.

See [auth-middleware.md](./auth-middleware.md).

---

## 3. Public routes still require JWT

**Symptom:** `/health` or `/auth/login` returns `401`.

**Cause:** Route not marked public. JWT middleware protects everything except paths in `meta.auth === false` (or `extraPublicPaths`).

**Fix:** Export meta on the route file:

```typescript
export const meta = { auth: false };
export default () => ({ ok: true });
```

For **manual** routes (`.get()`, `.post()`), pass meta as the last argument:

```typescript
app.get('/health', { response: HealthSchema }, handler, { auth: false });
```

---

## 4. Request-scoped state bleeds across users

**Symptom:** User A sees User B's transaction, tenant ID, or correlation data under concurrency.

**Cause:** Mutable state stored on a **singleton** service object shared by reference in every `ctx.services`.

**Fix:** Keep pools/clients as singletons; put per-request state in `scopedServices`:

```typescript
createKozo({
  services: { db: pool },
  scopedServices: (base, req) => ({
    reqId: req.header('x-request-id') ?? crypto.randomUUID(),
  }),
  onRequestEnd: async (scoped, error) => {
    // commit / rollback / release
  },
});
```

See [getting-started.md § DI](./getting-started.md#3-dependency-injection).

---

## 5. WebSocket routes ignored

**Symptom:** `app.ws('/chat', …)` never connects; no WebSocket upgrade.

**Cause:** `app.listen()` uses Node HTTP only. WebSockets require `nativeListen()` with `uWebSockets.js` installed.

**Fix:** (uWebSockets.js is published on GitHub, not npm)

```bash
pnpm add uNetworking/uWebSockets.js#v20.66.0
```

```typescript
await app.nativeListen(3000);
```

Console warning on startup: `[Kozo] WebSocket routes require nativeListen()…`

---

## 6. `loadRoutes()` loads nothing

**Symptom:** File routes 404; only manual routes work.

**Checks:**

| Check | Fix |
|-------|-----|
| No `routesDir` in `createKozo({ routesDir })` | Set path or pass `loadRoutes('./src/routes')` |
| Wrong directory | Use `kozo routes` to verify scan |
| File named wrong | Must be `get.ts`, `post.ts`, … or `index.ts` |
| `_middleware.ts` only | Middleware files are not routes |
| Private files | `_foo.ts`, `*.test.ts` are ignored |

---

## 7. `413 Content Too Large`

**Symptom:** Upload fails with 413.

**Cause:** Body exceeds default 1 MB limit.

**Fix:**

```typescript
createKozo({ maxBodyBytes: 10 * 1024 * 1024 }); // 10 MB
```

---

## 8. Handler works on `listen()` but not `nativeListen()`

**Symptom:** Route returns data on dev server but empty/wrong on uWS.

**Cause:** Old pattern — writing directly to `ctx.res` or expecting Hono-only `ctx.c`.

**Fix:** Use portable handler API (Kozo 0.4+):

```typescript
// ✅ both transports
export default (ctx) => ctx.json({ ok: true });
// or
export default (ctx) => ({ ok: true });
```

Avoid legacy handler types — use `KozoContext` / `KozoHandler`. Raw Node `req/res` only via `NativeKozoContext` on `nativeListen()`.

---

## 9. `gen:client` / OpenAPI missing routes

**Symptom:** Generated client skips file-system routes.

**Cause:** Client generation runs on **registered** routes. Call `loadRoutes()` before `generateClient()`.

**Fix:**

```typescript
export async function buildApp() {
  const app = createKozo({ routesDir: './src/routes' });
  await app.loadRoutes();
  return app;
}
```

Then: `kozo gen:client`

---

## 10. uWebSockets.js not installed

**Runtime message:**

```
[Kozo] uWebSockets.js is required but not installed.
It is published on GitHub, not npm — install it with:
  pnpm add uNetworking/uWebSockets.js#v20.66.0
```

This is intentional — native transport is an optional peer dependency. Note that
uWebSockets.js is distributed via GitHub (`uNetworking/uWebSockets.js#<tag>`),
not the npm registry, so `pnpm add uWebSockets.js` alone will fail.

---

## 11. CLI template not found

**Symptom:** `Could not find Kozo templates directory`

**Cause:** Old CLI version without bundled templates, or running outside the monorepo without published package.

**Fix:** Upgrade `@kozojs/cli` or see the [public Kozo repo](https://github.com/zazzo9039/kozojs) and use:

```bash
node packages/cli/lib/index.js my-app --template file-routing
```

---

## 12. Native transport limits (`nativeListen` / uWS)

Kozo's **native path** (`app.nativeListen()`) is optimized for JSON/text APIs at high
throughput. It is not a drop-in replacement for every pattern that works on
`app.listen()` (Node HTTP + Hono).

### What works well on the native path

- JSON request/response handlers (`ctx.json`, return plain objects)
- **Guards** (`app.guard`, `@kozojs/auth` JWT/role guards) — compiled into uWS
- WebSockets (requires uWS installed)
- Routes with no Hono middleware overlap — full native speed

### Hono bridge (middleware / legacy `_middleware.ts`)

Routes covered by Hono middleware patterns are **bridged** through Hono for
correctness (~35% slower than pure native). On the bridge:

| Feature | Native fast path | Hono bridge |
|---|---|---|
| JSON handlers | ✅ | ✅ |
| Multiple `Set-Cookie` | ✅ | ✅ (since 0.5.20) |
| **Streaming / SSE responses** | ❌ | ❌ **fully buffered** |
| `Transfer-Encoding: chunked` passthrough | ❌ | ❌ |

For Server-Sent Events or large streamed downloads, use `app.listen()` behind a
reverse proxy, or serve streams from a dedicated Node HTTP route.

### Request bodies

| Body type | `listen()` | `nativeListen()` |
|---|---|---|
| JSON / UTF-8 text | ✅ | ✅ |
| **Multipart / file uploads** | ✅ (Hono) | ❌ **not supported** — bodies are read as UTF-8 strings |
| Raw binary | ✅ | ❌ |

Use `listen()` for upload endpoints, or offload files to object storage via pre-signed URLs.

### TLS / HTTPS / bind address

- uWS **`SSLApp` is not wired** in Kozo 0.5.x — no built-in HTTPS on `nativeListen()`.
- The server binds **all interfaces** (`0.0.0.0`); there is no `host` option yet.

**Production pattern:** terminate TLS at **nginx**, Caddy, or a cloud load balancer;
run Kozo on HTTP behind the proxy.

### Body size limits

`maxBodyBytes` applies on all three entrypoints (`listen`, `nativeListen`, `listenSsr`)
via Content-Length pre-checks and uWS buffering limits. **Chunked uploads without
Content-Length** on `listen()` may bypass the pre-check — size-cap uploads at the
proxy if that matters.

### When to use which transport

```typescript
// Max throughput JSON API + guards + WebSockets
await app.nativeListen(3000);

// Multipart uploads, streaming, or simplest local dev
await app.listen(3000);
```

See also [§1 middleware vs guards](#1-security-middleware-doesnt-run-under-nativelisten--0515) and the
[`@kozojs/core` README](../packages/core/README.md).

---

## Runtime messages reference

| Message | Meaning |
|---------|---------|
| `[Kozo] WebSocket routes require nativeListen()` | WS registered but using `listen()` |
| `[Kozo] loadRoutes() skipped` | No `routesDir` configured |
| `Validation Failed` (400) | Zod schema mismatch — check `errors[]` in body |

---

## Static clients only see static contracts

Imperative route calls whose returned app type is ignored, `app.group()`, and routes
loaded from the file system remain valid at runtime but cannot extend a compile-time
route union after discovery. When OpenAPI, generated SDKs, or contract test clients
must see a route, define it with `createRouter()`, capture the returned chain, and
mount it with `app.mount()`.

Declared response statuses are not automatically exhaustive. Validation, guards,
body limits, rate limits, and internal failures can return additional statuses. Until
the automatic error sources share one verified schema, generated clients correctly
raise `KozoUnexpectedResponseError` for a status outside the route contract. Use raw
tests for malformed input and native smoke tests for transport-sensitive policy.

---

## OpenAPI fails on `z.date()` in response contracts

**Symptom:** Docs/OpenAPI generation throws `Date cannot be represented in JSON Schema`
(or similar) when a `*.contract.ts` uses `z.date()` / Date unions.

**Fix:** Wire dates as ISO strings (`z.string().datetime()`). If runtime values are
still `Date` (Prisma), preprocess to string before the contract boundary. See
[Contracts and errors](./contracts-and-errors.md). `kozo check` warns with
`KOZO_ARCH104`.

---

## Contract tests reject `success: true` with `z.literal(true)`

**Symptom:** Service returns `{ success: true }` typed as `{ success: boolean }` and
contract validation or typed clients fail against `z.literal(true)`.

**Fix:** Prefer `z.boolean()` in the response schema, or return `true as const` from
the service so the literal type is preserved.

---

## Mixing Nest `{ statusCode, message, error }` with RFC 7807

**Symptom:** Some routes document Problem Details while legacy handlers still emit
Nest-style bodies; clients and OpenAPI disagree.

**Fix:** Golden Path = RFC 7807. During migration, declare the legacy shape explicitly
in that route's response map instead of pretending it is a Problem. Do not claim a
single error union until every status shares one schema.

---

## See also

- [Getting Started](./getting-started.md)
- [Developer Guide](./developer-guide.md)
- [Auth Middleware](./auth-middleware.md)
- [Contracts and errors](./contracts-and-errors.md)
- [Feature modules](./feature-modules.md)
- [kozo-docs](https://kozo-docs.vercel.app) — sito pubblico (templates, CLI, Common Pitfalls)
- Runnable example: `examples/file-routing/`
