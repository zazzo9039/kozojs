# @kozojs/redis

## 0.5.22

### Patch Changes

- Updated dependencies [a146360]
  - @kozojs/core@0.5.22

## 0.5.10

### Patch Changes

- Updated dependencies [efefc5e]
  - @kozojs/core@0.5.10

## 0.5.9

### Patch Changes

- Updated dependencies
  - @kozojs/core@0.5.9

## 0.5.8

### Patch Changes

- Point npm `repository`, `homepage`, and `bugs` to the public GitHub repo `zazzo9039/kozojs` (not the private monorepo).
- Updated dependencies
  - @kozojs/core@0.5.8

## 0.5.7

### Patch Changes

- Updated dependencies
  - @kozojs/core@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies
  - @kozojs/core@0.5.6

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

### Patch Changes

- Updated dependencies
  - @kozojs/core@0.4.0
