# File-routing example

Runnable Kozo app demonstrating directory-based routes, `_middleware.ts`, JWT auth, and role guards.

## Run

From the monorepo root:

```bash
pnpm install
pnpm --filter file-routing dev
```

Server: `http://localhost:3000`

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | public | Liveness probe |
| POST | `/auth/login` | public | Get JWT |
| POST | `/auth/register` | public | Create user |
| GET | `/api/users` | JWT | List users |
| GET | `/api/users/:id` | JWT | Get user |
| GET | `/admin/stats` | JWT + admin | User count |

## Try it

```bash
# Health
curl http://localhost:3000/health

# Login as admin
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Save token, then list users
TOKEN="<paste token>"
curl http://localhost:3000/api/users -H "Authorization: Bearer $TOKEN"

# Admin stats
curl http://localhost:3000/admin/stats -H "Authorization: Bearer $TOKEN"

# Bob (user role) cannot access admin
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob@example.com","password":"user123"}'
# → 403 on /admin/stats
```

## Structure

```
src/
├── index.ts              # buildApp + listen
├── services.ts           # in-memory DI
└── routes/
    ├── _middleware.ts    # global logger
    ├── health/get.ts
    ├── auth/login/post.ts
    ├── auth/register/post.ts
    ├── api/_middleware.ts
    ├── api/users/get.ts
    ├── api/users/[id]/get.ts
    ├── admin/_middleware.ts   # role guard
    └── admin/stats/get.ts
```

## Key patterns

- **`registerAuthBeforeLoadRoutes`** before `loadRoutes()` so JWT runs before folder `_middleware.ts`
- **`meta: { auth: false }`** on public routes (health, auth)
- **`canActivate(hasRole('admin'))`** on `/admin/*`
