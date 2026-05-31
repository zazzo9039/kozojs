# Common Pitfalls

Quick reference for mistakes that look like framework bugs but are usually configuration or ordering issues.

---

## 1. Auth runs after role guards → always 403

**Symptom:** Admin routes return `403 Forbidden` even with a valid JWT. `user.role` is undefined in `_middleware.ts`.

**Cause:** JWT middleware registered **after** `loadRoutes()`. Directory `_middleware.ts` runs in registration order — your role guard executes **before** JWT decodes the token.

**Fix:** Use `registerAuthBeforeLoadRoutes()` **before** `loadRoutes()`:

```typescript
await registerAuthBeforeLoadRoutes(app, process.env.JWT_SECRET!, {
  routesDir: './src/routes',
  prefix: '',
});
await app.loadRoutes();
```

**Never:** register JWT enforcement **after** `loadRoutes()` when `_middleware.ts` checks `user.role`.

**Reference app:** **kozo-app** uses `registerApiSecurity()` (same ordering rule, plus rate limits) before `loadRoutes()`.

See [auth-middleware.md](./auth-middleware.md).

---

## 2. Public routes still require JWT

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

## 3. Request-scoped state bleeds across users

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

## 4. WebSocket routes ignored

**Symptom:** `app.ws('/chat', …)` never connects; no WebSocket upgrade.

**Cause:** `app.listen()` uses Node HTTP only. WebSockets require `nativeListen()` with `uWebSockets.js` installed.

**Fix:**

```bash
pnpm add uWebSockets.js
```

```typescript
await app.nativeListen(3000);
```

Console warning on startup: `[Kozo] WebSocket routes require nativeListen()…`

---

## 5. `loadRoutes()` loads nothing

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

## 6. `413 Content Too Large`

**Symptom:** Upload fails with 413.

**Cause:** Body exceeds default 1 MB limit.

**Fix:**

```typescript
createKozo({ maxBodyBytes: 10 * 1024 * 1024 }); // 10 MB
```

---

## 7. Handler works on `listen()` but not `nativeListen()`

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

## 8. `gen:client` / OpenAPI missing routes

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

## 9. uWebSockets.js not installed

**Runtime message:**

```
[Kozo] uWebSockets.js is required but not installed.
Run: pnpm add uWebSockets.js
```

This is intentional — native transport is an optional peer dependency.

---

## 10. CLI template not found

**Symptom:** `Could not find Kozo templates directory`

**Cause:** Old CLI version without bundled templates, or running outside the monorepo without published package.

**Fix:** Upgrade `@kozojs/cli` or see the [public Kozo repo](https://github.com/zazzo9039/kozojs) and use:

```bash
node packages/cli/lib/index.js my-app --template file-routing
```

---

## Runtime messages reference

| Message | Meaning |
|---------|---------|
| `[Kozo] WebSocket routes require nativeListen()` | WS registered but using `listen()` |
| `[Kozo] loadRoutes() skipped` | No `routesDir` configured |
| `Validation Failed` (400) | Zod schema mismatch — check `errors[]` in body |

---

## See also

- [Getting Started](./getting-started.md)
- [Developer Guide](./developer-guide.md)
- [Auth Middleware](./auth-middleware.md)
- [kozo-docs](https://kozo-docs.vercel.app) — sito pubblico (templates, CLI, Common Pitfalls)
- Runnable example: `examples/file-routing/`
