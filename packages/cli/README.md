# @kozojs/cli

🔥 **Scaffolding CLI for the [Kozo Framework](https://github.com/zazzo9039/kozo)** — the next-gen TypeScript backend framework with Zod-native validation and an optional uWebSockets.js transport.

## Quick Start

```bash
# One-shot (no install)
npx @kozojs/cli my-app

# Or install globally
npm install -g @kozojs/cli
kozo my-app
```

## Commands

```bash
kozo [project-name]        # scaffold a new project (interactive)
kozo dev                   # dev server with hot reload + route watcher
kozo build                 # build with tsup + optional routes manifest
kozo generate <type> <name># scaffold route or middleware
kozo g <type> <name>       # alias for generate
```

### `kozo build` flags

| Flag | Default | Description |
|---|---|---|
| `--no-manifest` | off | Skip `routes-manifest.json` generation |
| `--force-manifest` | off | Regenerate the manifest even if routes are unchanged |
| `--routes-dir <dir>` | `src/routes` | Routes directory relative to project root |
| `--manifest-out <path>` | — | Output path for `routes-manifest.json` |

Any unrecognized flag is forwarded to `tsup`.

## Interactive Setup

When you run `npx @kozojs/cli`, you'll be asked:

1. **Project name** — lowercase letters, digits, hyphens
2. **Target runtime** — `node` (default) / `cloudflare` / `bun`
3. **Template**
   - `Complete Server` — full production-ready app (Auth, CRUD, Stats)
   - `Starter` — minimal setup with database
   - `API Only` — minimal, no database
4. **Database** — `postgresql` / `mysql` / `sqlite` / `none` (skipped for API-Only)
5. **JWT authentication** — yes/no (skipped for API-Only)
6. **Frontend** — `none` / `react` / `solid` / `vue`
7. **SSR** — yes/no (when a frontend is selected)
8. **Extras** — `docker`, `github-actions`
9. **Install dependencies** — auto-runs `pnpm install`

## Generated Layout (Starter)

```
my-app/
├── src/
│   ├── db/
│   │   ├── schema.ts        # Drizzle schema
│   │   └── index.ts         # Database client
│   ├── services/
│   │   └── index.ts         # Typed service container
│   └── index.ts             # Entry point (createKozo + listen)
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

## Generated Layout (Complete Server)

```
my-app/
├── src/
│   ├── data/
│   │   └── store.ts         # In-memory data store
│   ├── routes/
│   │   ├── auth/index.ts    # /auth/login, /auth/me
│   │   ├── users/index.ts   # CRUD users
│   │   ├── posts/index.ts   # Posts with author/tags/filters
│   │   ├── health.ts        # GET /health
│   │   └── stats.ts         # GET /stats
│   ├── schemas/
│   │   ├── user.ts
│   │   ├── post.ts
│   │   └── common.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

### Complete Server endpoints

- `POST /auth/login` — Authenticate user
- `GET  /auth/me` — Current user
- `GET  /users?page=1&limit=10` — Paginated list
- `GET  /users/:id` — User by id
- `POST /users` — Create
- `PUT  /users/:id` — Update
- `DELETE /users/:id` — Delete
- `GET  /posts?published=true&tag=framework` — Filtered list
- `GET  /posts/:id` — Post with author
- `POST /posts` — Create
- `GET  /stats` — System stats
- `GET  /health` — Health check

## Zod-native API

Kozo compiles your Zod schemas **once at startup** — no Ajv, no `eval`, no JSON-Schema intermediate step. The handler context (`ctx.body`, `ctx.query`, `ctx.params`) is fully typed.

```typescript
import { createKozo, z } from '@kozojs/core';

const app = createKozo();

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

app.get('/users', {
  response: z.array(UserSchema),
}, () => users);

app.post('/users', {
  body: CreateUserSchema,
  response: UserSchema,
}, (ctx) => ({
  id: crypto.randomUUID(),
  name: ctx.body.name,    // ✅ string
  email: ctx.body.email,  // ✅ string
}));

app.get('/users/:id', {
  params: z.object({ id: z.string() }),
  response: UserSchema,
}, (ctx) => users.find((u) => u.id === ctx.params.id));

await app.listen(3000);
```

## What you get out of the box

- ✅ Zod-native validation (compiled at startup, no runtime parser hops)
- ✅ Auto-generated OpenAPI 3.1 spec from your schemas
- ✅ RFC 7807 problem-details error responses
- ✅ File-system routing with per-directory `_middleware.ts`
- ✅ Optional native C++ transport via `app.nativeListen()` (uWebSockets.js)
- ✅ Graceful shutdown with database cleanup hooks
- ✅ Typed client SDK generation via `app.generateClient()`

## Requirements

- Node.js >= 18.0.0
- pnpm (recommended) or npm

## License

MIT
