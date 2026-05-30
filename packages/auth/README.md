# @kozojs/auth

JWT authentication for [Kozo Framework](https://github.com/zazzo9039/kozo) — built on [`jose`](https://github.com/panva/jose).

## Install

```bash
npm install @kozojs/auth @kozojs/core
```

## Quick start (recommended — before `loadRoutes`)

Use **`registerAuthBeforeLoadRoutes`** when you have `_middleware.ts` role guards or anything that reads `user` before the handler:

```typescript
import { createKozo } from '@kozojs/core';
import { registerAuthBeforeLoadRoutes, createJWT } from '@kozojs/auth';

const app = createKozo({ routesDir: './src/routes' });

await registerAuthBeforeLoadRoutes(app, process.env.JWT_SECRET!, {
  routesDir: './src/routes',
  prefix: '/api',
  extraPublicPaths: ['/api/docs', '/api/docs.json'],
});

await app.loadRoutes();
await app.listen(3000);
```

Public routes: set `export const meta = { auth: false }` in the route file.

## Manual middleware

```typescript
import { authenticateJWT } from '@kozojs/auth';

// Optional decode (populates user when token present)
app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!, { optional: true }));

// Enforce on protected paths
app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!));
```

Handlers receive `ctx.user` (Kozo) or `c.get('user')` (Hono raw context).

For apps with custom rate limits or extra middleware (see **kozo-app** `registerApiSecurity`), compose
`authenticateJWT` manually **before** `loadRoutes()` — same ordering rule as above.

## Role guards

```typescript
import { canActivate, isAuthenticated, hasRole } from '@kozojs/auth';

// routes/api/admin/_middleware.ts
export default canActivate(isAuthenticated, hasRole('admin'));
```

## Create tokens

```typescript
import { createJWT } from '@kozojs/auth';

const token = await createJWT(
  { email: 'user@example.com', role: 'admin' },
  process.env.JWT_SECRET!,
  { expiresIn: '24h' },
);
```

## Options (`AuthOptions`)

| Option | Description |
|--------|-------------|
| `prefix` | Path prefix (default `'/api'`) |
| `optional` | Soft decode — no 401 without token |
| `getToken` | Custom extractor (default Bearer header) |
| `getKey` | RS256 / JWKS via jose |
| `allowedAlgorithms` | Default `HS256`, `HS384`, `HS512` |

## License

MIT
