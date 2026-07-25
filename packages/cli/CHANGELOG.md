# @kozojs/cli

## 0.5.23

### Patch Changes

- Updated dependencies
  - @kozojs/core@0.5.23

## 0.5.22

### Patch Changes

- a146360: **Security — rotate `JWT_SECRET` in every project generated before this release.** Projects scaffolded with `kozo create` on 0.5.21 or earlier sign their tokens with a secret that is published inside the npm packages, so anyone can forge any token — including an admin one — against those deployments. Upgrading the packages does **not** fix a running service: you must generate a new secret, set `JWT_SECRET` in every environment, redeploy, and treat every token issued before the rotation as compromised. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.

  - `@kozojs/core`: new `requireSecret(name, { minBytes })` helper, next to `defineEnv`. Reads a secret from the environment and throws at startup when it is missing, empty, shorter than 32 bytes, or equal to a placeholder Kozo has published. Also exports `KNOWN_WEAK_SECRETS`, `isKnownWeakSecret`, `assertStrongSecret`, `secretByteLength` and `MIN_SECRET_BYTES`.
  - `@kozojs/auth`: `authenticateJWT` and `jwtGuard` now validate the secret **at construction**, not per request. A published placeholder is refused on every `NODE_ENV`; an unset variable is refused; a secret under 32 bytes throws when `NODE_ENV=production` and warns once otherwise. `Uint8Array` key material and asymmetric `getKey` flows are unaffected.
  - `@kozojs/cli`: no template or generator emits a secret literal any more. Scaffolded projects read `JWT_SECRET` through `requireSecret()` with no fallback, get a freshly generated secret written into their local `.env`, and ship a `.env.example` with the field blank. Generated `docker-compose.yml` requires `JWT_SECRET` instead of defaulting it.

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
