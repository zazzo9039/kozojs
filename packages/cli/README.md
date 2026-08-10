<p align="center">
  <a href="https://github.com/zazzo9039/kozojs">
    <img src="https://raw.githubusercontent.com/zazzo9039/kozojs/main/assets/brand/kozo-banner.jpg" alt="Kozo — TypeScript backend framework: Routes · Validation · OpenAPI · Generated Client" width="960">
  </a>
</p>

# @kozojs/cli

🔥 **Scaffold a [Kozo](https://github.com/zazzo9039/kozojs) backend** — file-system routes, services and auth, structured from day one.

## Quick Start

```bash
# One-shot (no install) — interactive wizard
npx @kozojs/cli my-app

# Bundled starter (no prompts)
npx @kozojs/cli my-app --template api-contract
npx @kozojs/cli my-app --template minimal
npx @kozojs/cli my-app --template file-routing
npx @kozojs/cli my-app --template fullstack-ssr

cd my-app
pnpm dev

# Or install globally
npm install -g @kozojs/cli
kozo my-app
```

### Bundled templates (`--template`)

| Template | Description |
|---|---|
| `api-contract` | Recommended production API: feature modules, contracts, tests and CI |
| `minimal` | Smallest Kozo app — single entry, `nativeListen()` |
| `file-routing` | File-system routes under `src/routes/` |
| `fullstack-ssr` | React + Vite frontend with SSR and API backend |

These ship inside the CLI package (`packages/cli/templates/`) and are copied as-is — no database/auth wizard.

## Commands

```bash
kozo [project-name]              # scaffold (interactive or --template)
kozo dev                         # dev server with hot reload + route watcher
kozo build                       # tsup build + optional routes manifest
kozo generate feature <name>     # recommended production feature skeleton
kozo g f <name>                  # short alias
kozo generate <type> <name>      # legacy file-routing scaffold
kozo routes                      # list discovered file-system routes
kozo types                       # generate .kozo/types.d.ts from kozo.config.ts
kozo check                       # architecture and contract conventions
kozo gen:client                  # typed API client from registered routes
```

### `kozo generate feature`

```bash
kozo generate feature users
kozo g f users --crud
kozo g f trips --repository
kozo g f admin --auth --dry-run
```

The generator emits contract, service, static routes, tests, and a public barrel.
`--crud`, `--repository`, and `--auth` add only the requested layers. Existing files
are never overwritten without confirmation or explicit `--force`; `--dry-run` prints
the deterministic output without writing.

### `kozo check`

Use `--architecture`, `--contracts`, or `--json` to select rules or integrate findings
with CI. Blocking findings make the command exit non-zero.

### `kozo build` flags

| Flag | Default | Description |
|---|---|---|
| `--no-manifest` | off | Skip `routes-manifest.json` generation |
| `--force-manifest` | off | Regenerate the manifest even if routes are unchanged |
| `--routes-dir <dir>` | `src/routes` | Routes directory relative to project root |
| `--manifest-out <path>` | — | Output path for `routes-manifest.json` |

Any unrecognized flag is forwarded to `tsup`.

## Interactive Setup (legacy scaffolds)

When you run `npx @kozojs/cli` **without** `--template`, the wizard asks:

For new projects, prefer one of the bundled `--template` starters above. The interactive path remains available for the older configurable scaffold generator.

1. **Project name** — lowercase letters, digits, hyphens
2. **Target runtime** — `node` (default) / `cloudflare` / `bun`
3. **Template**
   - `Complete Server` — feature-rich example app (Auth, CRUD, Stats)
   - `Starter` — minimal setup with database
   - `API Only` — minimal, no database
4. **Database** — `postgresql` / `mysql` / `sqlite` / `none` (skipped for API-Only)
5. **JWT authentication** — yes/no (skipped for API-Only)
6. **Frontend** — `none` / `react` / `solid` / `vue`
7. **SSR** — yes/no (when a frontend is selected)
8. **Extras** — `docker`, `github-actions`
9. **Install dependencies** — auto-runs `pnpm install`

> **MySQL in scaffolds:** the wizard can scaffold MySQL, but `@kozojs/db` **query helpers are PostgreSQL/SQLite only** in 0.5.x — use raw Drizzle on MySQL or pick PostgreSQL. See [`@kozojs/db` README](../db/README.md#query-helpers-postgresql--sqlite-only).

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

## What you get out of the box

- ✅ Zod-native validation (compiled at startup)
- ✅ Auto-generated OpenAPI 3.1 spec from your schemas
- ✅ RFC 7807 problem-details error responses
- ✅ File-system routing with per-directory `_middleware.ts`
- ✅ Optional native C++ transport via `app.nativeListen()` (uWebSockets.js)
- ✅ Graceful shutdown with database cleanup hooks
- ✅ Typed client SDK generation via `kozo gen:client`

## Requirements

- Node.js >= 20.19.0 (matches `@kozojs/core`)
- pnpm (recommended) or npm

## See also

- [`@kozojs/core`](../core/README.md) — API, guards, middleware, OpenAPI
- [`@kozojs/auth`](../auth/README.md) — JWT guards for `nativeListen()`

## License

MIT
