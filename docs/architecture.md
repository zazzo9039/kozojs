# Architecture Deep Dive

How Kozo processes requests, compiles routes, and achieves high performance.

---

## Request Lifecycle

```
Client Request
     │
     ▼
┌─────────────────────┐
│   Transport Layer    │  Node.js HTTP / uWebSockets.js
└──────────┬──────────┘
           │
     ▼─────┴──────────────────────────────────────┐
     │  Global Middleware (cors, logger, auth...)   │
     └──────────┬─────────────────────────────────┘
           │
     ▼─────┴──────────────────────────────────────┐
     │  Per-Directory Middleware (_middleware.ts)   │
     │  Executed root → leaf in directory order    │
     └──────────┬─────────────────────────────────┘
           │
     ▼─────┴──────────────────────────────────────┐
     │  Schema Validation (Zod safeParse)          │
     │  body → query → params                      │
     └──────────┬─────────────────────────────────┘
           │
     ▼─────┴──────────────────────────────────────┐
     │  Route Handler                              │
     │  Receives typed ctx: { body, query,         │
     │  params, services, user, req }              │
     └──────────┬─────────────────────────────────┘
           │
     ▼─────┴──────────────────────────────────────┐
     │  Response Serialization                     │
     │  JSON.stringify with date handling          │
     └───────────────────────────────────────────┘
```

## Compilation Pipeline

When `loadRoutes()` or `register()` is called, Kozo compiles route handlers ahead of time:

### 1. Schema Compilation (`SchemaCompiler.compile()`)

```
RouteSchema { body?: ZodType, query?: ZodType, params?: ZodType }
     │
     ▼
ZValidator functions (Zod safeParse wrappers)
     │
     ▼
Compiled handler with inline validation
```

The `makeZValidator()` function wraps Zod schemas into a fast validation function:
- Calls `schema.safeParse(data)` once
- On success: strips extra fields in-place, applies coerced values
- On failure: returns structured errors with field paths

**No Ajv is used** — Kozo validates purely with Zod. The validator API is intentionally Ajv-compatible (callable with `.errors` side-channel) for potential future swappability.

### 2. Handler Compilation (`compileRouteHandler()`)

Each route handler is wrapped in an optimized Hono handler that:

1. Parses the request body (JSON) with size limit check
2. Runs Zod validators for body/query/params
3. Builds a `KozoContext` object (prototype-based, one allocation per request)
4. Calls the user handler
5. Serializes the response

The `KozoContext` uses prototype-based method binding so that response helpers (`ctx.json`, `ctx.text`, etc.) can be safely destructured.

### 3. uWS Native Compilation

When using `nativeListen()`, routes are additionally compiled for the uWebSockets.js transport:

- C++ radix trie router (zero JS routing overhead)
- Cork/uncork batching for response writes
- Direct buffer operations (no Web API Request/Response allocations)

Native handlers are compiled lazily — only when `nativeListen()` is actually called.

## Transport Layer

### Hono Transport (default)

```typescript
app.listen(3000);
```

- Uses `@hono/node-server` to serve Hono apps on Node.js
- Compatible with all Node.js environments
- No native dependencies required

### uWebSockets.js Transport

```typescript
app.nativeListen(3000);
```

- C++ HTTP parser (µHttpParser) — eliminates IncomingMessage/ServerResponse
- Native radix trie router — O(1) route matching
- WebSocket support with native pub/sub topics
- ~33% faster throughput vs Hono transport

### SSR Transport

```typescript
app.listenSsr(3000, { root: '../web', entryServer: 'src/entry-server.tsx' });
```

- Single server for API + frontend
- Dev mode: Vite middleware with HMR
- Prod mode: static file serving + SSR template rendering
- API routes bypass SSR pipeline via `apiPrefix` config

## File-System Routing

### Route Discovery

```
scanRoutes(routesDir)
     │
     ├── Recursively list .ts/.js files (skip _prefixed, .test, .spec)
     ├── Parse filenames → { method, path }
     ├── Dynamic import each module
     ├── Extract schema + meta exports
     └── Sort by specificity (static > dynamic > catch-all)
```

### Per-Directory Middleware Discovery

```
scanMiddleware(routesDir)
     │
     ├── Recursively find _middleware.ts / _middleware.js files
     ├── Dynamic import each default export
     ├── Derive URL prefix from directory path
     └── Sort by depth (root first → leaf last)
```

### File Naming Convention

| Pattern | Result |
|---|---|
| `users/get.ts` | `GET /users` |
| `users/post.ts` | `POST /users` |
| `users/index.ts` | `GET /users` |
| `users/[id]/get.ts` | `GET /users/:id` |
| `users/[id?].ts` | `GET /users/:id?` (optional) |
| `posts/[...slug].ts` | `GET /posts/*` (catch-all) |
| `_middleware.ts` | Scoped middleware |

## Graceful Shutdown

```
SIGTERM / app.shutdown()
     │
     ▼
1. onStop lifecycle hook
2. Stop accepting new connections
3. Drain in-flight requests (configurable timeout)
4. Close database connections (if registered)
5. Close server
```

The `ShutdownManager` tracks in-flight requests via an atomic counter. New requests during shutdown receive `503 Service Unavailable`.

## Performance Design Decisions

1. **Prototype-based context** — response helpers on prototype, not per-request closures
2. **Lazy uWS compilation** — native handlers compiled only when nativeListen() is called  
3. **In-place mutation** — Zod validation strips extra fields without creating new objects
4. **Frozen singletons** — `VALID_RESULT` is `Object.freeze()`'d, shared across all successful validations
5. **Ahead-of-time compilation** — schema validators compiled once at startup, not per-request
6. **Parallel route loading** — `Promise.all()` for module imports + compilation
