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

Scanned automatically by `registerAuthBeforeLoadRoutes`.

## Manual middleware

Use when you need custom composition (e.g. rate limits before JWT enforcement, as in **kozo-app** `registerApiSecurity`):

```typescript
import { scanRoutes } from '@kozojs/core';
import { authenticateJWT } from '@kozojs/auth';

// Still register **before** loadRoutes()
app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!, { optional: true }));
app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!));
```

## Role guards (`_middleware.ts`)

```typescript
import { canActivate, isAuthenticated, hasRole } from '@kozojs/auth';

export default canActivate(isAuthenticated, hasRole('admin'));
```

Requires JWT registration **before** `loadRoutes()`.

## Handler access

```typescript
app.get('/api/me', {}, (ctx) => ctx.user);
```

## See also

- [`packages/auth/README.md`](../packages/auth/README.md)
- [Getting started](./getting-started.md)
- [Common pitfalls](./common-pitfalls.md) — auth ordering
