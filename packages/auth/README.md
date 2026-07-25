# @kozojs/auth

Authentication for [Kozo](https://github.com/zazzo9039/kozojs) that stays on the native uWebSockets fast path — JWT guards, roles, no Hono bridge. Built on [`jose`](https://github.com/panva/jose).

## Install

```bash
npm install @kozojs/auth @kozojs/core
```

## Quick start (recommended — guards)

**`registerAuthGuard`** is the single source of truth for authentication: the
same check runs on `listen()` (Hono) AND on `nativeListen()` (uWebSockets.js)
at native speed — no Hono bridge, no middleware bypass.

```typescript
import { createKozo, requireSecret } from '@kozojs/core';
import { registerAuthGuard, roleGuard } from '@kozojs/auth';

const app = createKozo({ routesDir: './src/routes' });

await registerAuthGuard(app, requireSecret('JWT_SECRET'), {
  routesDir: './src/routes',
  prefix: '/api',
  extraPublicPaths: ['/api/docs', '/api/docs.json'],
});

// Role-protected subtrees (reads the user set by the JWT guard)
app.guard('/api/admin/*', roleGuard('admin'));

await app.loadRoutes();
await app.nativeListen(3000); // or app.listen(3000) — identical semantics
```

Public routes: set `export const meta = { auth: false }` in the route file.

## Composable guards

```typescript
import { requireSecret } from '@kozojs/core';
import { jwtGuard, roleGuard } from '@kozojs/auth';

app.guard('/api/*', jwtGuard(requireSecret('JWT_SECRET'), {
  publicPaths: ['/api/health', '/api/docs'],
}));
app.guard('/api/admin/*', roleGuard(['admin', 'owner']));
```

Handlers receive `ctx.user`; later guards see it as `req.user`.

```typescript
import type { KozoContext } from '@kozojs/core';
import { UnauthorizedError } from '@kozojs/auth';

export default async (ctx: KozoContext) => {
  const { user } = ctx;
  if (!user) throw new UnauthorizedError();
  return { message: `Hello ${user.email}` };
};
```

## API reference

| Export | Description |
|--------|-------------|
| `registerAuthGuard(app, secret, options)` | **Recommended.** Scans `meta.auth = false` routes and registers `jwtGuard` before `loadRoutes()` |
| `jwtGuard(secret, options?)` | Guard: verifies Bearer JWT, attaches payload as `user` |
| `roleGuard(role \| roles[])` | Guard: 403 unless `user.role` matches (run after JWT) |
| `createJWT(payload, secret, options?)` | Sign HS256 JWT (`expiresIn`, etc.) |
| `decodeTokenPayload(token)` | Decode payload **without** verification (display only) |
| `registerAuthBeforeLoadRoutes(app, secret, options)` | **Deprecated** — middleware twin of `registerAuthGuard` |
| `authenticateJWT(secret, options?)` | Legacy Hono middleware |
| `canActivate(...guards)` · `hasRole` · `anyOf` · `isSelf` · `isAuthenticated` | Legacy Hono role middleware |
| `UnauthorizedError` | 401 helper |

## Options

### `jwtGuard` / `registerAuthGuard`

| Option | Description |
|--------|-------------|
| `prefix` | Path prefix (default `'/api'`) |
| `publicPaths` | Extra paths that skip JWT (login, docs, …) |
| `requiredClaims` | Claim names that must be present in the payload |
| `getToken` | Custom extractor (default Bearer header) |
| `getKey` | RS256 / JWKS via jose |
| `allowedAlgorithms` | Default `HS256`, `HS384`, `HS512` |

### `authenticateJWT` (`AuthOptions`, legacy)

| Option | Description |
|--------|-------------|
| `prefix` | Path prefix (default `'/api'`) |
| `optional` | Soft decode — no 401 without token |
| `getToken` | Custom extractor (default Bearer header) |
| `getKey` | RS256 / JWKS via jose |
| `allowedAlgorithms` | Default `HS256`, `HS384`, `HS512` |

## Create tokens

```typescript
import { requireSecret } from '@kozojs/core';
import { createJWT } from '@kozojs/auth';

const token = await createJWT(
  { email: 'user@example.com', role: 'admin' },
  requireSecret('JWT_SECRET'),
  { expiresIn: '24h' },
);
```

## Legacy: Hono middleware

> ⚠️ **Deprecated for native apps.** `registerAuthBeforeLoadRoutes` and
> `authenticateJWT` register Hono middleware: under `nativeListen()` every
> covered route is served through the Hono bridge (correct since core 0.5.16,
> but ~35% slower than guards). On core ≤ 0.5.15 middleware was **silently
> bypassed** under `nativeListen()` — upgrade immediately.

```typescript
import { requireSecret } from '@kozojs/core';
import { authenticateJWT } from '@kozojs/auth';

app.middleware('/api/*', authenticateJWT(requireSecret('JWT_SECRET')));
```

## Role guards (Hono `_middleware.ts` style — legacy)

```typescript
import { canActivate, isAuthenticated, hasRole } from '@kozojs/auth';

// routes/api/admin/_middleware.ts — forces the Hono bridge; prefer roleGuard
export default canActivate(isAuthenticated, hasRole('admin'));
```

## See also

- [@kozojs/core guards](https://github.com/zazzo9039/kozojs/tree/main/packages/core#guards-security--single-source-of-truth) — `app.guard()`, `rateLimitGuard`, transport-agnostic security
- [`@kozojs/core` README](../core/README.md) — full framework reference

## License

MIT
