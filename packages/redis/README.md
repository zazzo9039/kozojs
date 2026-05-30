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
import Kozo from '@kozojs/core';
import { redisPlugin } from '@kozojs/redis';

const app = new Kozo();

let redis;
app.use(redisPlugin({
  connection: 'redis://localhost:6379',
  onReady: (r) => { redis = r; },
}));
```

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
