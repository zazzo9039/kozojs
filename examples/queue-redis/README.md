# queue-redis example

Reference consumer for **`@kozojs/redis`** (cache) and **`@kozojs/queue`** (BullMQ on Redis).

## Prerequisites

- Node 20+
- Redis 7+ (`docker run -d -p 6379:6379 redis:7-alpine`)

## Run

```bash
cp .env.example .env
pnpm install   # from repo root
pnpm --filter queue-redis-example start
```

## Try it

```bash
curl -X POST http://localhost:3001/jobs -H 'Content-Type: application/json' -d '{"message":"hello"}'
curl http://localhost:3001/cache/demo
curl http://localhost:3001/cache/demo   # cache hit
```

The worker logs processed jobs to stdout. Graceful shutdown closes the queue adapter and Redis via `queuePlugin` + `ShutdownManager`.

## What it demonstrates

| Package | Usage |
|---------|--------|
| `@kozojs/redis` | `createRedis` → `services.redis.cache` |
| `@kozojs/queue` | `createQueue` → enqueue in route, `process()` in `index.ts`, `queuePlugin` for shutdown |

See also: [file-routing](../file-routing) (auth + file routes without Redis).
