# JWT authentication

Kozo uses **`@kozojs/auth`** with the [`jose`](https://github.com/panva/jose) library.

## Recommended: register before `loadRoutes`

When using `_middleware.ts` for role checks (admin, etc.), JWT **must** run first:

```typescript
import { createKozo } from '@kozojs/core';
import { registerAuthBeforeLoadRoutes } from '@kozojs/auth';

const app = createKozo({ routesDir: './src/routes' });

await registerAuthBeforeLoadRoutes(app, process.env.JWT_SECRET!, {
  routesDir: './src/routes',
  prefix: '/api',
  extraPublicPaths: ['/api/docs', '/api/docs.json'],
});

await app.loadRoutes();
```

## Public routes

```typescript
export const meta = { auth: false };
```

Scanned automatically by `registerAuthBeforeLoadRoutes` / `setupAuth`.

## Manual middleware

```typescript
import { authenticateJWT } from '@kozojs/auth';

app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!, { optional: true }));
app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!));
```

## Role guards (`_middleware.ts`)

```typescript
import { canActivate, isAuthenticated, hasRole } from '@kozojs/auth';

export default canActivate(isAuthenticated, hasRole('admin'));
```

Requires `registerAuthBeforeLoadRoutes` **before** `loadRoutes()`.

## Legacy: `setupAuth` after `loadRoutes`

Safe only when **no** `_middleware.ts` reads `user` before handlers. See `@kozojs/auth` README.

## Handler access

```typescript
app.get('/api/me', {}, (ctx) => ctx.user);
```

## See also

- [`packages/auth/README.md`](../packages/auth/README.md)
- [Getting started](./getting-started.md)
