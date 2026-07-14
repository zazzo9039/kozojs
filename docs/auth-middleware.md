# JWT authentication

Kozo uses **`@kozojs/auth`** with the [`jose`](https://github.com/panva/jose) library.

> **0.5.16+:** auth is **guard-based** (`app.guard()`) — the same check runs on
> `listen()` and `nativeListen()`, compiled into the uWS fast path. The
> middleware-based API is deprecated: on core ≤ 0.5.15 it was **silently
> bypassed** under `nativeListen()`.

## Recommended: `registerAuthGuard` before `loadRoutes`

```typescript
import { createKozo } from '@kozojs/core';
import { registerAuthGuard, roleGuard } from '@kozojs/auth';

const app = createKozo({ routesDir: './src/routes' });

await registerAuthGuard(app, process.env.JWT_SECRET!, {
  routesDir: './src/routes',
  prefix: '/api',
  extraPublicPaths: ['/api/docs', '/api/docs.json'],
});

// Role-protected subtrees — reads the user set by the JWT guard
app.guard('/api/admin/*', roleGuard('admin'));

await app.loadRoutes();
```

## Public routes

```typescript
export const meta = { auth: false };
```

Scanned automatically by `registerAuthGuard`.

## Manual guards

Use when you need custom composition (e.g. rate limits before JWT enforcement,
as in **kozo-native-api** `registerApiSecurity`):

```typescript
import { rateLimitGuard } from '@kozojs/core';
import { jwtGuard } from '@kozojs/auth';

// Still register **before** loadRoutes()
app.guard('/api/auth/*', rateLimitGuard({ max: 20, window: 60 }));
app.guard('/api/*', jwtGuard(process.env.JWT_SECRET!, {
  publicPaths: ['/api/auth', '/api/health'],
}));
```

## Role checks

```typescript
import { roleGuard } from '@kozojs/auth';

app.guard('/api/admin/*', roleGuard('admin'));
app.guard('/api/content/*', roleGuard(['admin', 'editor']));
```

Register **after** the JWT guard (guards chain in registration order).

<details>
<summary>Legacy: Hono middleware / <code>_middleware.ts</code> role guards</summary>

```typescript
// Deprecated — forces the Hono bridge under nativeListen()
import { authenticateJWT, canActivate, isAuthenticated, hasRole } from '@kozojs/auth';

app.middleware('/api/*', authenticateJWT(process.env.JWT_SECRET!));

// routes/api/admin/_middleware.ts
export default canActivate(isAuthenticated, hasRole('admin'));
```

</details>

## Handler access

```typescript
app.get('/api/me', {}, (ctx) => ctx.user);
```

## See also

- [`packages/auth/README.md`](../packages/auth/README.md)
- [Getting started](./getting-started.md)
- [Common pitfalls](./common-pitfalls.md) — auth ordering
