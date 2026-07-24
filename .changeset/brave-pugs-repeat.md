---
"@kozojs/core": patch
"@kozojs/auth": patch
"@kozojs/cli": patch
---

**Security — rotate `JWT_SECRET` in every project generated before this release.** Projects scaffolded with `kozo create` on 0.5.21 or earlier sign their tokens with a secret that is published inside the npm packages, so anyone can forge any token — including an admin one — against those deployments. Upgrading the packages does **not** fix a running service: you must generate a new secret, set `JWT_SECRET` in every environment, redeploy, and treat every token issued before the rotation as compromised. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.

- `@kozojs/core`: new `requireSecret(name, { minBytes })` helper, next to `defineEnv`. Reads a secret from the environment and throws at startup when it is missing, empty, shorter than 32 bytes, or equal to a placeholder Kozo has published. Also exports `KNOWN_WEAK_SECRETS`, `isKnownWeakSecret`, `assertStrongSecret`, `secretByteLength` and `MIN_SECRET_BYTES`.
- `@kozojs/auth`: `authenticateJWT` and `jwtGuard` now validate the secret **at construction**, not per request. A published placeholder is refused on every `NODE_ENV`; an unset variable is refused; a secret under 32 bytes throws when `NODE_ENV=production` and warns once otherwise. `Uint8Array` key material and asymmetric `getKey` flows are unaffected.
- `@kozojs/cli`: no template or generator emits a secret literal any more. Scaffolded projects read `JWT_SECRET` through `requireSecret()` with no fallback, get a freshly generated secret written into their local `.env`, and ship a `.env.example` with the field blank. Generated `docker-compose.yml` requires `JWT_SECRET` instead of defaulting it.
