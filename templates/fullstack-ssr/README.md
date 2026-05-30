# {{PROJECT_NAME}}

Full-stack starter: unified server via `listenSsr()` — API under `/api/*`, React SSR for everything else.

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000` — SSR page + `http://localhost:3000/api/health`

## Structure

```
src/
  index.ts          # listenSsr entry
  routes/           # file-routing API
web/
  index.html
  src/main.tsx      # client hydrate
  src/entry-server.tsx
```
