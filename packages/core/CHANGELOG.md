# @kozojs/core

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
