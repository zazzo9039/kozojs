<p align="center">
  <a href="https://github.com/zazzo9039/kozojs">
    <img src="https://raw.githubusercontent.com/zazzo9039/kozojs/main/assets/brand/kozo-banner.jpg" alt="Kozo — TypeScript backend framework: Routes · Validation · OpenAPI · Generated Client" width="960">
  </a>
</p>

# @kozojs/redis

Redis integration for Kozo — cache, pub/sub, and distributed rate-limit store.

## Install

```bash
pnpm add @kozojs/redis ioredis
```

## Quick Start

### Standalone

```ts
import { createRedis } from '@kozojs/redis';

const redis = await createRedis({ connection: 'redis://localhost:6379' });

// Cache
await redis.cache.set('user:1', { name: 'Alice' }, 3600);
const user = await redis.cache.get('user:1');

// Pub/Sub
const unsub = await redis.pubsub.subscribe('events', (data) => {
  console.log('received:', data);
});
await redis.pubsub.publish('events', { type: 'hello' });

// Rate-limit store
const result = await redis.rateLimit.increment('ip:127.0.0.1', 60_000);
console.log(result.count, result.resetAt);

// Raw ioredis client
await redis.raw.ping();

await redis.close();
```

### As Kozo Plugin

```ts
import { createKozo } from '@kozojs/core';
import { redisPlugin, type KozoRedis } from '@kozojs/redis';

const app = createKozo();

let redis: KozoRedis | undefined;
app.use(redisPlugin({
  connection: 'redis://localhost:6379',
  onReady: (r) => { redis = r; },
}));
```

For typed service injection, create the client first and pass it to `createKozo({ services: { redis } })`. Use `redisPlugin()` when the `onReady` callback fits your initialization flow and you want shutdown cleanup registered automatically.

## API

### `createRedis(config): Promise<KozoRedis>`

Creates a Redis client with cache, pub/sub, and rate-limit store.

**Config:**
- `connection` — Redis URL string or ioredis options object
- `prefix` — Key prefix (default: `'kozo:'`)
- `lazyConnect` — Connect lazily (default: `false`)

### `redisPlugin(options): Plugin`

Kozo plugin that creates a Redis client and registers cleanup on shutdown.

**Options:** Same as `createRedis` config, plus:
- `onReady(redis)` — Callback with the ready instance
- `closeTimeout` — Graceful close timeout in ms (default: `5000`)

### Cache — `redis.cache`

- `get<T>(key): Promise<T | null>`
- `set(key, value, ttlSeconds?): Promise<void>`
- `del(...keys): Promise<void>`
- `has(key): Promise<boolean>`
- `ttl(key): Promise<number>`

### Pub/Sub — `redis.pubsub`

- `publish<T>(channel, data): Promise<void>`
- `subscribe<T>(channel, handler): Promise<() => Promise<void>>`

### Rate-Limit Store — `redis.rateLimit`

- `increment(key, windowMs): Promise<{ count, resetAt }>`
- `reset(key): Promise<void>`

Uses a Lua script for atomic increment + expiry.
