# JWT authentication

Kozo uses **`@kozojs/auth`** with the [`jose`](https://github.com/panva/jose) library.

> **0.5.16+:** auth is **guard-based** (`app.guard()`) — the same check runs on
> `listen()` and `nativeListen()`, compiled into the uWS fast path. The
> middleware-based API is deprecated: on core ≤ 0.5.15 it was **silently
> bypassed** under `nativeListen()`.

## The secret

`jwtGuard` and `authenticateJWT` validate the secret **when you construct them**,
so a bad one stops the process from starting rather than failing every request.
They refuse:

- any secret Kozo has itself published — the placeholders that used to ship in
  the starter templates — on every `NODE_ENV`;
- an unset variable (`undefined` reaching the constructor);
- anything shorter than 32 bytes when `NODE_ENV=production`. Outside production
  a short secret warns once instead, so a development setup still boots.

Read it with `requireSecret()`, which has no fallback:

```typescript
import { requireSecret } from '@kozojs/core';

const secret = requireSecret('JWT_SECRET'); // throws if unset, short, or a known placeholder
```

Generate one with:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

> **If you scaffolded a project before 0.5.22**, its secret is a literal that
> shipped inside the published packages. Rotate `JWT_SECRET` and treat every
> token issued before the rotation as forgeable.

## Recommended: `registerAuthGuard` before `loadRoutes`

```typescript
import { createKozo, requireSecret } from '@kozojs/core';
import { registerAuthGuard, roleGuard } from '@kozojs/auth';

const app = createKozo({ routesDir: './src/routes' });

await registerAuthGuard(app, requireSecret('JWT_SECRET'), {
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
import { rateLimitGuard, requireSecret } from '@kozojs/core';
import { jwtGuard } from '@kozojs/auth';

// Still register **before** loadRoutes()
app.guard('/api/auth/*', rateLimitGuard({ max: 20, window: 60 }));
app.guard('/api/*', jwtGuard(requireSecret('JWT_SECRET'), {
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
import { requireSecret } from '@kozojs/core';
import { authenticateJWT, canActivate, isAuthenticated, hasRole } from '@kozojs/auth';

app.middleware('/api/*', authenticateJWT(requireSecret('JWT_SECRET')));

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
