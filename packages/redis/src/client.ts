import type { KozoRedis, RedisConfig } from './types.js';
import { createCache } from './cache.js';
import { createPubSub, closeSubscriber } from './pubsub.js';
import { createRateLimitStore } from './rate-limit-store.js';

/**
 * Create a KozoRedis client.
 *
 * Peer dependency: `ioredis` — dynamically imported so the package
 * doesn't pull in ioredis if only the types are used.
 *
 * ```ts
 * import { createRedis } from '@kozojs/redis';
 *
 * const redis = createRedis({
 *   connection: process.env.REDIS_URL ?? 'redis://localhost:6379',
 *   prefix: 'myapp:',
 * });
 *
 * await redis.cache.set('user:1', { name: 'Alice' }, 3600);
 * const user = await redis.cache.get<User>('user:1');
 *
 * redis.pubsub.subscribe('notifications', (data) => console.log(data));
 * await redis.pubsub.publish('notifications', { type: 'new-user' });
 * ```
 */
export async function createRedis(config: RedisConfig): Promise<KozoRedis> {
  const { connection, prefix = '', lazyConnect = true } = config;

  // Dynamic import — ioredis is a peer dependency
  const Redis = await import('ioredis').then(
    (m) => m.default ?? m,
    () => {
      throw new Error(
        '[kozo:redis] ioredis is required. Install it: npm install ioredis',
      );
    },
  );

  // Main connection (cache, rate-limit, publish)
  const client = typeof connection === 'string'
    ? new Redis(connection, { lazyConnect })
    : new Redis({ ...connection, lazyConnect } as any);

  if (lazyConnect) await client.connect();

  // Pub/Sub needs a separate connection (ioredis requirement)
  let subscriberRef: any;
  const createSubscriber = () => {
    subscriberRef = client.duplicate();
    return subscriberRef;
  };

  const cache = createCache(client, prefix);
  const pubsub = createPubSub(client, createSubscriber);
  const rateLimit = createRateLimitStore(client, prefix);

  return {
    cache,
    pubsub,
    rateLimit,
    raw: client,

    async close() {
      await closeSubscriber(subscriberRef);
      await client.quit().catch(() => {});
    },
  };
}
