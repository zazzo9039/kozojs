# @kozojs/core

## 0.6.0

### Minor Changes

- Generate readable camelCase client method names, reject ambiguous route-name
  collisions, and update every CLI scaffold to the current Kozo configuration,
  OpenAPI, route-loading, and listener APIs.

## 0.5.23

### Patch Changes

- Rate limiting now derives direct connection addresses correctly under Hono,
  ignores spoofed forwarding headers unless proxy trust is explicitly enabled,
  and isolates the default in-memory counters of independent limiter policies
  while retaining a process-wide memory bound.
- Filesystem middleware loading now fails closed instead of silently starting
  without a route's middleware.
- `assertStrongSecret` now validates string and `Uint8Array` key material
  consistently.

## 0.5.22

### Patch Changes

- a146360: **Security — rotate `JWT_SECRET` in every project generated before this release.** Projects scaffolded with `kozo create` on 0.5.21 or earlier sign their tokens with a secret that is published inside the npm packages, so anyone can forge any token — including an admin one — against those deployments. Upgrading the packages does **not** fix a running service: you must generate a new secret, set `JWT_SECRET` in every environment, redeploy, and treat every token issued before the rotation as compromised. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.

  - `@kozojs/core`: new `requireSecret(name, { minBytes })` helper, next to `defineEnv`. Reads a secret from the environment and throws at startup when it is missing, empty, shorter than 32 bytes, or equal to a placeholder Kozo has published. Also exports `KNOWN_WEAK_SECRETS`, `isKnownWeakSecret`, `assertStrongSecret`, `secretByteLength` and `MIN_SECRET_BYTES`.
  - `@kozojs/auth`: `authenticateJWT` and `jwtGuard` now validate the secret **at construction**, not per request. A published placeholder is refused on every `NODE_ENV`; an unset variable is refused; a secret under 32 bytes throws when `NODE_ENV=production` and warns once otherwise. `Uint8Array` key material and asymmetric `getKey` flows are unaffected.
  - `@kozojs/cli`: no template or generator emits a secret literal any more. Scaffolded projects read `JWT_SECRET` through `requireSecret()` with no fallback, get a freshly generated secret written into their local `.env`, and ship a `.env.example` with the field blank. Generated `docker-compose.yml` requires `JWT_SECRET` instead of defaulting it.

## 0.5.10

### Patch Changes

- efefc5e: Restore compiled response serialization (`fast-json-stringify`) with defensive fallback, response contract enforcement for undeclared fields, and uWS body-read optimizations. Document behavior in README and CHANGELOG.

## 0.5.10

### Patch Changes

- Restore **compiled response serialization** via `fast-json-stringify` when the Zod `response` schema is JSON-serializable; transparent `JSON.stringify` fallback for `z.any()`, `.transform()`, `z.date()`, and other schemas where `z.toJSONSchema` throws.
- **Response contract enforcement:** routes with a `response` schema omit undeclared fields from JSON output — declare every field you return, or remove `response` for pass-through serialization.
- Optimize uWS body reads (`chunksToUtf8` fast-path) and hoist `TextDecoder` for WebSocket handlers.

## 0.5.9

### Patch Changes

- Fix README markdown so npm registry renders it (escape HTML comments and angle brackets in tables).

## 0.5.8

### Patch Changes

- Point npm `repository`, `homepage`, and `bugs` to the public GitHub repo `zazzo9039/kozojs` (not the private monorepo).

## 0.5.7

### Patch Changes

- Point npm repository, homepage, bugs, and package README links to the public `zazzo9039/kozojs` GitHub repo.

## 0.5.6

### Patch Changes

- Fix uWS response lifecycle (write after abort/end), add fair autocannon benchmarks (random order + cooldown), and align benchmark docs methodology.

## 0.4.0

### Minor Changes

- Align all `@kozojs/*` packages to a single version line.

  From this release the entire family ships with the same version (`0.4.0`). Going forward, any change to one package will bump every other package as well — there is now **one Kozo version** to track instead of seven.

  **Why**

  - Eliminates the ambiguity around `peerDependencies` ranges (`>=0.2.8` / `>=0.3.0` / `>=0.3.10` all meant "needs a recent core")
  - Makes compatibility trivial to communicate: every `@kozojs/*` package at version `X.Y.Z` is guaranteed to work with every other `@kozojs/*` package at `X.Y.Z`
  - Standard `fixed` group enforced via `@changesets/cli` configuration

  **Peer-dependency changes**

  - `@kozojs/auth`, `@kozojs/queue`, `@kozojs/redis`, `@kozojs/testing` now require `@kozojs/core: ^0.4.0`

  **CLI**

  - `kozo --version` now reads from `package.json` at build time instead of a hardcoded string, preventing drift.
