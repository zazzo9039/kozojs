# {{PROJECT_NAME}}

Minimal Kozo API — two manual routes, no file routing.

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

- `GET /health` — liveness
- `GET /hello/:name` — greeting

## Next steps

- Add `routesDir: './src/routes'` and `await app.loadRoutes()` for file-based routing
- See `templates/file-routing` or `examples/file-routing` in the Kozo repo
