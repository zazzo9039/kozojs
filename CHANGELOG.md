# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Composable static route contracts with `createRouter()` and `app.mount()`.
- Route-derived in-process and native test clients in `@kozojs/testing`.
- Typed and validated request header schemas across both transports.
- A complete contract testing showcase with OpenAPI and generated SDK output.

### Changed

- Status-specific response contracts now drive both typing and serialization.
- Generated clients encode path parameters, repeat array query keys, support
  Zod 4 enums, and select declared non-200 success schemas.

### Fixed

- Undeclared error statuses no longer pass through a different status
  serializer and fail as 500 responses.
- File-system routes normalize response schemas before compilation and load
  bracket-based dynamic segments correctly under Vite and Vitest.

## [0.6.0] — 2026-07-25

### Changed

- Generated client methods now use readable camelCase route names:
  `GET /users/:id` generates `usersById()` instead of `users_Byid()`.
- Client generation rejects ambiguous route-name collisions and protects
  internal client members instead of emitting invalid TypeScript.
- CLI starters and the interactive scaffold now use `app.mountDocs()`, pass
  ports to `listen()` or `nativeListen()`, and load filesystem routes before
  starting.
- Starter dependencies and every `@kozojs/*` package are aligned to `0.6.0`.

### Documentation

- Reworked the framework and package READMEs around runnable onboarding,
  contract-based client generation, transport choices, and verified APIs.

### CI

- npm releases now authenticate through trusted publishing (OIDC) and include
  registry provenance without storing a long-lived publish token.

## [0.5.23] — 2026-07-25

### Security

- Rate limiting now uses the direct Hono connection address and ignores
  client-controlled forwarding headers unless proxy trust is explicitly enabled.
- Independent in-memory limiter policies no longer share counters, while the
  process-wide store remains bounded.
- JWT secret checks now cover `Uint8Array` keys and direct `createJWT` calls.
- Filesystem middleware loading fails closed when a middleware module cannot be
  imported.

### CI

- Manual npm publishing has a dedicated, non-cancelling concurrency group, so a
  push cannot interrupt a release partway through the package sequence.

## [0.5.22] — 2026-07-24

> ### 🔴 Rotate `JWT_SECRET` in every project generated before this release
>
> Projects scaffolded with `kozo create` on **0.5.21 or earlier** sign their JWTs
> with a secret that ships inside the published npm packages. It is public
> knowledge, so anyone can forge any token against those deployments — including
> an admin one. **Upgrading the packages does not fix a running service.**
>
> For every affected deployment:
>
> 1. Generate a new secret:
>    `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`
> 2. Set `JWT_SECRET` to it in every environment (a different value per environment).
> 3. Redeploy.
> 4. Treat every token issued before the rotation as compromised — invalidate
>    sessions and re-authenticate users. Audit access logs for the period the old
>    secret was live.
>
> Affected values, in case you are grepping your own configuration:
> `dev-secret-must-be-at-least-32-characters-long`,
> `change-me-to-a-random-secret-at-least-32-chars`,
> `change-me-to-a-random-secret`, `change-me-in-production`, `change-me`.

### Security

- **`@kozojs/auth`: `authenticateJWT` and `jwtGuard` now validate the secret at construction time**, not per request — a bad secret stops the process from starting instead of failing every request. A placeholder Kozo has published is refused on every `NODE_ENV`; an unset variable is refused; a secret shorter than 32 bytes throws under `NODE_ENV=production` and warns once otherwise. `Uint8Array` key material and asymmetric `getKey` flows are unaffected.
- **`@kozojs/core`: new `requireSecret(name, { minBytes })`**, alongside `defineEnv`. Reads a secret from the environment with no fallback and throws at startup when it is missing, empty, under 32 bytes, or a known placeholder. Also exports `KNOWN_WEAK_SECRETS`, `isKnownWeakSecret`, `assertStrongSecret`, `secretByteLength`, `MIN_SECRET_BYTES`.
- **`@kozojs/cli`: no template or generator emits a secret literal.** Scaffolded projects read `JWT_SECRET` through `requireSecret()`, get a freshly generated secret written into their local `.env`, and ship a `.env.example` with the field blank. Generated `docker-compose.yml` requires `JWT_SECRET` instead of defaulting it.

### Changed

- Starter template loads `.env` (`tsx --env-file-if-exists`), and the generated `complete` project imports `dotenv/config`, so removing the secret fallback does not leave either unable to boot.
- Docs and READMEs use `requireSecret('JWT_SECRET')` in place of `process.env.JWT_SECRET!` — the non-null assertion is a compile-time claim only, and an unset variable reached the verifier as `undefined`.
- `templates/` is now the single source of truth for the starter trees. `scripts/copy-cli-templates.mjs --check` runs in CI before the build and fails when `packages/cli/templates/` has drifted; a test holds `examples/file-routing/` to the same content.

## [0.5.21] — 2026-07-14

> **P2 polish + post-0.5.20 fixes.** Additive DX/correctness across core, db,
> redis, cli and testing; aligns all `@kozojs/*` packages to 0.5.21.

### Added

- `@kozojs/testing`: **`createNativeTestClient(app)`** — boots `nativeListen()` on an ephemeral port and drives the same test-client API over real HTTP, so native-transport behavior (guards, `ctx.header`, optional params, CORS) is finally testable.
- `@kozojs/redis`: **`psubscribe(pattern, handler)`** for glob channel patterns (ioredis `pmessage`), with `punsubscribe` on last-handler cleanup.
- `@kozojs/db`: connection/pool/SSL **`options`** passthrough for PostgreSQL (`max`, `idle_timeout`, `ssl`, `prepare`, …) and SQLite (`readonly`, `fileMustExist`, `timeout`).
- Docs: [Native transport limits](docs/common-pitfalls.md#12-native-transport-limits-nativelisten--uws) — multipart, streaming bridge, HTTPS/bind notes.

### Changed

- `@kozojs/core`: **`listen()` returns `{ port, server }`** (like `nativeListen()`), reporting the OS-assigned port for `port: 0`. Additive — callers that ignore the return still work.
- `@kozojs/cli`: **`kozo dev`** dropped the decorative delays, fixed the step counters, and resolves the real entry (package.json `main` / conventions) instead of a hardcoded `src/index.ts` and fake `port 3000`.
- `@kozojs/db`: README/description clarify **PostgreSQL/SQLite for query helpers**; MySQL is **connection-only** in 0.5.x (raw Drizzle).
- `@kozojs/auth`: `decodeTokenPayload` delegates to `decodeJWT` (jose) — correct UTF-8, no duplicate `atob` path.
- `@kozojs/cli`: manifest route paths normalized to `/` on Windows (`normalizeRouteFilePath`).
- CI: merge **Publish Gate** into `.github/workflows/ci.yml` — one Actions run per push/PR (tests + pack/publint/smoke when `packages/**` changes). Publish: `gh workflow run ci.yml -f publish=true`.

### Fixed

- `@kozojs/core`: Zod coercion/transform now applied to **array request bodies** (`body: z.array(...)`) — previously the handler received the untransformed values.
- `@kozojs/db`: `isUniqueViolation` recognizes MySQL `ER_DUP_ENTRY`.

## [0.5.20] — 2026-07-13

> **Pre-launch hardening release.** Closes P0 transport/SSR bugs, uWS-first parity
> gaps, OSS community files, and aligns all `@kozojs/*` packages to 0.5.20.

### Fixed — `@kozojs/core`

- SSR: malformed percent-encoding in static file paths returns **400** instead of
  crashing the server (`decodeURIComponent` guard).
- `ctx.header()` on both transports — Hono uses `c.body()` when headers were set;
  uWS merges user headers on every response path.
- Optional path params (`:id?`) on uWS via `expandUwsPatterns()` — matches Hono
  `listen()` semantics (`/opt` and `/opt/42` both work).
- `use(plugin)` async-safe — `flushPluginInstalls()` before `listen()`,
  `nativeListen()`, and `listenSsr()` (fixes `redisPlugin` race).
- Uniform `maxBodyBytes` — passed into `compileUwsNativeHandler`; `listenSsr()`
  applies the same Content-Length pre-check as `listen()`.
- `KozoConfig.onError` / `onNotFound` wired on Hono and compiled route handlers;
  removed never-read config keys (`port`, `mode`, `runtime`, `target`,
  `monitoring`, `basePath`, `openapi`).
- `GuardRequest.remoteAddress` on the uWS native path (sync capture from uWS);
  `rateLimitGuard` falls back to client IP when proxy headers are absent;
  `UwsReqAdapter` reports the real HTTP method per route.
- uWS Hono bridge preserves **multiple `Set-Cookie`** headers (`getSetCookie()`).

### Changed — `@kozojs/core`

- Removed unused runtime dead code: experimental WASM radix router,
  `compileNativeHandler` / uWS shims (never wired into `nativeListen()`).
- uWebSockets.js install docs/runtime message use GitHub spec
  `uNetworking/uWebSockets.js#v20.66.0`.

### Added — repository

- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- GitHub issue template (bug report) and pull request template.

### Fixed — `@kozojs/db`

- `RowNotFoundError` / `RowConflictError` extend `NotFoundError` / `ConflictError`
  (`KozoError` hierarchy → correct 404/409 responses).

### Changed — `@kozojs/cli` / templates

- Starter templates try `nativeListen()` first, fall back to `listen()`; add
  `uWebSockets.js` GitHub dependency spec.
- Scaffold default npm range bumped to `^0.5.20`.

### Removed

- Obsolete `benchmarks/wasm-radix.bench.ts` (WASM router PoC removed in core).

## [0.5.19] — 2026-06-18

### Changed
- `@kozojs/core`: npm description and README now open with the positioning
  ("build your backend from a single contract" — routes, validation, OpenAPI
  and a typed client derived from one Zod schema) instead of internal
  serialization details. Docs/metadata only, no code changes.

## [0.5.18-auth] — 2026-06-18

> `@kozojs/auth` only.

### Changed
- `@kozojs/auth`: npm description and README hero now lead with the
  native-transport guarantee ("authentication that stays on the native
  uWebSockets fast path — JWT guards, roles, no bridge tax") rather than "JWT
  authentication guards". Docs/metadata only, no code changes.

## [0.5.17-cli] — 2026-06-18

> `@kozojs/cli` only.

### Changed
- `@kozojs/cli`: npm description and README hero replaced the generic
  "next-gen TypeScript Backend Framework" with what the CLI actually scaffolds
  (file-system routes, services and auth, structured from day one).
  Docs/metadata only, no code changes.

## [0.5.18] — 2026-06-12

### Fixed
- `@kozojs/core`: the generated client serialized `z.record(...)` in the
  Zod v3 single-argument form, which does not compile against Zod 4 (the
  key type became mandatory). Now emits `z.record(key, value)`. Found by
  generating a client for a schema with per-unit override maps.

## [0.5.17] — 2026-06-12

### Fixed
- `@kozojs/core`: `createRouteFactory` no longer types the handler via an
  intersection — `RouteDefinitionOptions` gained an optional `TServices`
  generic, so `ctx.services` keeps the concrete app type (passing it to a
  function no longer degrades to a `Services | AppServices` union).

## [0.5.17-auth] — 2026-06-11

> `@kozojs/auth` only.

### Fixed
- `@kozojs/auth` README: complete API reference on npm (guards, `jwtGuard`
  options, section order).

## [0.5.16] — 2026-06-11

> **Security release.** `nativeListen()` (uWS) previously bypassed every Hono
> middleware: auth, rate limits and CORS registered via `app.middleware()` or
> `_middleware.ts` did not run — protected routes answered without a token.
> Found live on kozo-native-api, present since the uWS transport landed.

### Fixed
- `@kozojs/core`: routes covered by `app.middleware()` / `_middleware.ts`
  patterns are now **bridged through the Hono pipeline** under
  `nativeListen()` — identical semantics to `listen()`. Uncovered routes keep
  the zero-shim native path. Conservative pattern matching
  (`middlewarePatternOverlaps`), bridge via `makeUwsHonoBridge`.
- `@kozojs/core`: ephemeral-port bind retry on `nativeListen({ port: 0 })`.

### Added
- `@kozojs/core`: `app.guard(pattern, guard)` — transport-agnostic security
  checks compiled into the uWS fast path (+33% vs the middleware bridge with
  JWT). `guardToHonoMiddleware`, `wrapNativeWithGuards`, `rateLimitGuard`,
  per-request CORS origin echo + native preflight, `req.user` propagation
  into uWS handler ctx.
- `@kozojs/auth`: `jwtGuard`, `roleGuard`, `registerAuthGuard` — guard-based
  equivalent of `registerAuthBeforeLoadRoutes`, which is now deprecated.
- `@kozojs/cli`: scaffold templates use guards instead of `getApp().use`
  (invisible to `nativeListen()`); template deps bumped to `^0.5.16`.
- tests: `guard-parity` + `middleware-parity` suites — auth status, user
  propagation, headers, chaining and rate limits asserted identical on
  `listen()` and `nativeListen()`.

### Fixed (misc)
- `@kozojs/queue`: flaky Redis events integration test (QueueEvents connect
  race).

## [0.5.15] — 2026-06-11

### Fixed
- `@kozojs/core`: `defineKozoApp({ types })` is now optional — it only feeds
  the augmentation-based typegen, and apps on `createRouteFactory` have no
  use for it. Previously every app was forced to carry the ref.

## [0.5.14] — 2026-06-11

### Added
- `@kozojs/core`: `createRouteFactory<TServices>()` — a `defineRoute` bound to
  the app's concrete services type. The explicit alternative to augmenting the
  global `KozoServices` interface: no typegen script, no pre-hooks, no
  generated d.ts, and two apps in one repo cannot fight over a single global
  interface. Pair it with a package.json subpath import
  (`"imports": { "#kozo": "./src/kozo.ts" }`) so every route file imports the
  same alias at any folder depth. The augmentation path (`renderKozoTypesDts`,
  `kozo types`) keeps working for existing apps.

## [0.5.13] — 2026-06-11

> DX release: secure-by-default API docs, a generated client that survives a
> real app, silenceable banner. All packages aligned to 0.5.13.

### Added
- `@kozojs/core`: `app.mountDocs({ path, title, version, enabled })` mounts
  Swagger UI + the OpenAPI 3.1 spec of every registered route. **Off in
  production** unless `enabled: true` is passed explicitly; the spec is
  generated lazily on first request, so it works before or after
  `loadRoutes()` and with both `listen()` and `nativeListen()`; auto-tags
  skip a leading `api` path segment. Replaces ~50 lines of per-app glue.
- `@kozojs/core`: generated client v2 — `getToken` (bearer, sync or async),
  `onRequest` / `onUnauthorized` / `onError` hooks, `KozoApiError` carrying
  RFC 7807 problem details, custom `fetch`, per-call `{ signal, headers }`,
  `null` on 204 instead of a `.json()` crash, query params dropping
  null/undefined instead of serializing the string "undefined".
- `@kozojs/core`: `createKozo({ logger: false })` silences the startup banner
  (`listen`, `nativeListen`, and `listenSsr` — the flag is forwarded to the SSR
  server, where it can also be set directly via `SsrConfig.logger`).

### Fixed
- `@kozojs/core` README: dependency count corrected (4 runtime deps, not 3) and
  the headline no longer leads with uWebSockets.js, which is an optional peer.
- All library packages: `"./package.json"` added to `exports` — tools doing
  `require('@kozojs/core/package.json')` hit `ERR_PACKAGE_PATH_NOT_EXPORTED`
  before.

## [0.5.12] — 2026-06-10

> Node support floor decided: >= 20.19 (`require(esm)`). Resolves the known
> issue noted in 0.5.11; all packages aligned to 0.5.12.

### Changed
- **Node floor**: `engines.node >= 20.19.0` declared in all 7 packages (and the
  workspace root). The CLI is a CJS bundle that `require()`s ESM-only deps
  (execa, @clack/prompts, @kozojs/core): that needs `require(esm)`, available
  from Node 20.19. Node 18 and 20 < 20.19 (both EOL) were never able to run
  the published CLI.
- `@kozojs/cli`: fails fast with a clear message on Node < 20.19 instead of an
  `ERR_REQUIRE_ESM` stack; build target raised node14 → node20.
- `@kozojs/core`, `@kozojs/auth`: the `"require"` export condition pointing to
  an ESM file (misleading on old Node, flagged by publint/attw) is replaced
  with `"default"` — CJS consumers on >= 20.19 load it via `require(esm)`.
- `@kozojs/db`: `types` condition listed first in `exports` (TS resolution
  convention, flagged by publint).
- Publish gate is now fully blocking: publint + attw (`--profile esm-only`)
  and the smoke matrix (Node 20/22/24) gate every publish; core smoke also
  covers `require("@kozojs/core")`.
- CI/gate workflows: actions bumped (checkout v6, setup-node v6,
  pnpm/action-setup v6, upload-artifact v7, download-artifact v8) ahead of the
  June 16, 2026 forced Node 24 runtime; CI test matrix now includes Node 24.

## [0.5.11] — 2026-06-10

> Hotfix: `@kozojs/cli` 0.5.9–0.5.10 were uninstallable from npm.

### Fixed
- `@kozojs/cli`: `"@kozojs/core": "workspace:*"` leaked into the published `dependencies` (raw `npm publish` does not rewrite the workspace protocol) — every `npm install @kozojs/cli` / `npx @kozojs/cli` failed since 0.5.9. Dependency is now `workspace:^`, published as `^0.5.10`.
- `@kozojs/cli`: `create-kozo <name> --template <t>` crashed (`ENOENT` after a silent no-op copy) whenever the CLI was installed as a package: the template dir lives inside `node_modules`, and the copy filter rejected its own root. Filter now matches `node_modules` relative to the template root.

### Added
- `publish-gate` GitHub Actions workflow: packs with pnpm, asserts no `workspace:`/`file:`/`link:` protocols in packed manifests, runs publint + arethetypeswrong, smoke-installs the tarballs in an empty project across the Node matrix, and (manual dispatch) publishes the same validated tarballs in dependency order. Replaces `publish.sh`.
- `scripts/smoke-core.mjs`: standalone smoke test for the packed `@kozojs/core` tarball.

### Known issues
- The CLI is a CJS bundle that `require()`s pure-ESM `@kozojs/core`: startup fails on Node 18 and 20 < 20.19 (`ERR_REQUIRE_ESM`) while `engines` still claims `>=18`. Tracked by the non-blocking gate jobs (Node 18 / 20.18.3) and the publint/attw steps, pending the module-strategy decision.

## [0.5.2] — 2026-05-30

> Consolidation release: CLI test coverage, typecheck CI gate, queue/redis example, docs refresh.

### Added
- `@kozojs/cli`: 20 new tests (scan, manifest, generate, routes command, scaffold templates) — 30 total
- `examples/queue-redis` — reference consumer for `@kozojs/redis` + `@kozojs/queue`
- Root `pnpm typecheck` script and CI step (`tsc --noEmit` on all 7 packages)

### Changed
- Monorepo `tsconfig.json`: removed source `paths` — packages resolve `@kozojs/core` via workspace `lib/`
- kozo-docs: all package pages aligned with 0.5.x APIs

### Fixed
- CLI `route-watcher` tests use current `generateManifest` API (`projectRoot`, `cache`, `contentHash`)

## [0.5.1] — 2026-05-30

> API cleanup release: remove legacy auth/handler types, align CLI templates, expand `@kozojs/db` tests.

### Added
- `@kozojs/db`: test suite expanded from 5 to 23 tests (query helpers, drizzle-zod, sqlite CRUD)

### Removed
- `@kozojs/auth`: `setupAuth()` — use `registerAuthBeforeLoadRoutes()` before `loadRoutes()`, or compose `authenticateJWT` manually (see kozo-app `registerApiSecurity`)
- `@kozojs/auth`: `SetupAuthOptions` type — use `RegisterAuthOptions`
- `@kozojs/core`: `HandlerContext`, `RouteHandler` — use `KozoContext`, `KozoHandler`
- `@kozojs/core`: `RouteModule.middleware` — use `_middleware.ts` or `app.middleware()`

### Changed
- `@kozojs/core`: `RouteModule.default` typed as `KozoHandler<S>`
- CLI `kozo generate route` templates use `KozoContext` instead of `HandlerContext`
- `NativeKozoContext` / `NativeKozoHandler` documented as advanced Node.js API (no longer marked deprecated)

### Migration (0.5.0 → 0.5.1)

**Auth — replace `setupAuth` after `loadRoutes`:**

```typescript
// Before (removed)
await app.loadRoutes();
setupAuth(app, secret, { prefix: '/api' });

// After
await registerAuthBeforeLoadRoutes(app, secret, {
  routesDir: './src/routes',
  prefix: '/api',
});
await app.loadRoutes();
```

**Handlers — replace `HandlerContext`:**

```typescript
// Before
import type { HandlerContext } from '@kozojs/core';
export default async ({ body, services }: HandlerContext<Body>) => { ... };

// After
import type { KozoContext } from '@kozojs/core';
export default async (ctx: KozoContext<typeof schema>) => {
  const { body, services } = ctx;
  ...
};
```

**kozo-app:** no changes required — already uses `registerApiSecurity()` before `loadRoutes()`.

## [0.5.0] — 2026-05-30

> DX hardening release: route meta, scoped DI, CLI templates, onboarding docs, CI, and test coverage across all packages.

### Added
- Route `meta` preserved for manual routes (auth, tags, rate limits)
- `KozoConfig.maxBodyBytes` for configurable request body limits
- Scoped DI via `scopedServices(base, req)` with teardown
- Unified Hono/uWS handler context (`buildNativeContext`)
- CLI templates (`minimal`, `file-routing`, `fullstack-ssr`), `kozo routes`, `kozo gen:client`, `--template`
- `examples/file-routing` with smoke script
- `docs/getting-started.md`, `docs/common-pitfalls.md`
- GitHub Actions CI (build + test on Node 20/22)
- `@kozojs/db` test suite (5 tests)

### Changed
- Peer dependencies on `@kozojs/core` bumped to `^0.5.0` for auth, queue, redis, testing
- `setupAuth` deprecated with runtime warning (use `createKozo` + auth plugin)
- Templates use `zod ^4.3.6` aligned with core

### Migration

Upgrade all `@kozojs/*` packages together:

```bash
pnpm add @kozojs/core@0.5.0 @kozojs/auth@0.5.0 @kozojs/db@0.5.0
# (etc. for the packages you use)
```

## [0.4.0] — 2026-05-28

> First release after the version-alignment migration. All `@kozojs/*` packages now ship under a single version line. Per-package CHANGELOGs live in `packages/*/CHANGELOG.md` and are generated by changesets.

### Added
- **All `@kozojs/*` packages aligned to one version line.** From this release onward, any change in one package bumps every other package as well. Enforced via `@changesets/cli` with a `fixed` group in `.changeset/config.json`
- `@changesets/cli` added at workspace root for release management
- `repository`, `homepage`, and `bugs` fields in every published `package.json` (`auth`, `cli`, `db`, `queue`, `redis`, `testing`) and root metadata
- `benchmarks/RESULTS.md`: reproduction commands, environment template, refresh checklist

### Changed
- **BREAKING — Peer dependencies.** `@kozojs/auth`, `@kozojs/queue`, `@kozojs/redis`, `@kozojs/testing` now require `@kozojs/core: ^0.4.0` (previously `>=0.2.8`, `>=0.3.0`, `>=0.3.10`)
- `kozo --version` now reads from `package.json` at build time instead of a hardcoded string, preventing drift

### Fixed
- `packages/auth/README.md` and `packages/db/README.md` GitHub links pointed to a non-existent `kozojs/kozo` org; now use `zazzo9039/kozo`
- `packages/cli/README.md` no longer claims `Ajv + fast-json-stringify` validation (validator was switched to Zod-native in 0.3.x)
- `docs/README.md` no longer references `@kozo/env`, `@kozo/storage`, `@kozo/resilience`, `@kozo/schedule`, `@kozo/tracing` (never published); scope corrected to `@kozojs/*`
- Root `README.md` now lists all seven published packages (previously listed only `core`, `db`, `cli`)
- Benchmark code samples updated from the deprecated `new App()` API to `createKozo()` in `benchmarks/RESULTS.md`, `benchmarks/README.md`, `benchmarks/QUICK-SUMMARY.md`

### Migration

If you were pinned to specific versions of individual packages, upgrade them together to `0.4.0`:

```bash
pnpm add @kozojs/core@0.4.0 @kozojs/auth@0.4.0 @kozojs/db@0.4.0
# (etc. for the packages you use)
```

If you had `peerDependencies` resolving via `>=` on `@kozojs/core`, your lockfile will need to be refreshed.

## [0.3.30] — 2026-04-01

### Added
- `LICENSE` (MIT) file at repository root
- `CHANGELOG.md` following Keep a Changelog format
- Integration tests (end-to-end request → response)

### Fixed
- Removed broken `zod-to-json-schema` dependency; OpenAPI + client SDK now work with Zod v4
- Removed dead `generateSchema()` from public API
- Consolidated duplicate error class hierarchies (deprecated `HttpError` tree removed)

## [0.3.29] — 2026-04-01

### Added
- 246 unit tests across 13 test files (70% statement coverage)
- `@vitest/coverage-v8` dev dependency

### Changed
- Disabled sourcemap generation in tsup build
- Added `coverage/` and `*.map` to `.gitignore`
- Excluded integration-only files (`uws-transport.ts`, `ssr.ts`, `ws.ts`) from coverage thresholds

### Removed
- Sourcemap files from git tracking

## [0.3.28] — 2026-04-01

### Fixed
- `register()` now uses `normalizedSchema` instead of raw `schema` for Hono handler compilation
- `listenSsr()` shutdown uses hot-swap pattern (no per-request `isShuttingDown()` check)
- `STATIC_CACHE` eviction uses Map iterator + LRU instead of `Array.from()` allocation
- `buildCtx()` uses prototype chain (`CTX_PROTO` + `HonoReqAdapter`) — 2 objects per request instead of 9
- `DEFAULT_MAX_BODY_BYTES` aligned to 1 MB across all transports
- Fixed undefined `MAX_BODY_BYTES` reference in `compileUwsNativeHandler()`

## [0.3.0] — 2026-03-15

### Added
- Native WebSocket support via uWebSockets.js (`app.ws()`)
- Pluggable rate-limit store interface (Redis, in-memory)
- `ShutdownManager.addCleanupHook()` for plugin shutdown integration
- WASM radix router v2 (Zig-compiled, ~150 ns bridge overhead)
- `NativeKozoContext` for `nativeListen()` power-user handlers
- `fast-response.ts` utilities for zero-allocation response writing
- RFC 7807 Problem Details error system (`KozoError` hierarchy)
- OpenAPI 3.1.0 spec generation with Swagger UI HTML
- Type-safe client SDK generation (`generateTypedClient()`)
- SSR integration with Vite (dev HMR + prod static serving)
- File-system routing with `scanRoutes()` and parallel imports

### Changed
- Replaced Ajv with Zod-native validation (no `eval`, no URL-string supply chain)
- Schema compilation happens once at startup (not per-request)
- Route compiler produces transport-specific closures (Hono, Node native, uWS)

## [0.2.0] — 2026-02-15

### Added
- `@kozojs/queue` — multi-backend job queue (Redis, AMQP)
- `@kozojs/redis` — cache, pub/sub, distributed rate-limit store
- `@kozojs/testing` — in-process test client (no HTTP server)
- `@kozojs/db` — Drizzle ORM integration
- `@kozojs/auth` — JWT authentication middleware

## [0.1.0] — 2026-01-09

### Added
- Initial release: Hono-based framework with Zod validation
- `@kozojs/cli` for project scaffolding
- Basic benchmarking suite
