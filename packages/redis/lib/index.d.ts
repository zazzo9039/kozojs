interface RedisConfig {
    /** ioredis connection URL (redis://...) or options object. */
    connection: string | Record<string, unknown>;
    /** Key prefix for all operations (default: none). */
    prefix?: string;
    /** Lazy connect — don't open TCP until first command (default: true). */
    lazyConnect?: boolean;
}
interface KozoCache {
    /** Get a value. Returns undefined on miss. */
    get<T = unknown>(key: string): Promise<T | undefined>;
    /** Set a value with optional TTL in seconds. */
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    /** Delete one or more keys. Returns number of keys removed. */
    del(...keys: string[]): Promise<number>;
    /** Check if a key exists. */
    has(key: string): Promise<boolean>;
    /** Get remaining TTL in seconds. -1 = no expiry, -2 = key missing. */
    ttl(key: string): Promise<number>;
}
type PubSubHandler<T = unknown> = (data: T, channel: string) => void;
interface KozoPubSub {
    /** Publish JSON-serializable data to a channel. Returns receiver count. */
    publish<T = unknown>(channel: string, data: T): Promise<number>;
    /** Subscribe to a channel. Returns unsubscribe function. */
    subscribe<T = unknown>(channel: string, handler: PubSubHandler<T>): () => void;
}
interface RateLimitStoreRecord {
    count: number;
    resetAt: number;
}
interface RateLimitStore {
    /** Increment and return { count, resetAt } for a key within a window. */
    increment(key: string, windowMs: number): Promise<RateLimitStoreRecord>;
    /** Reset a specific key (for testing / admin). */
    reset(key: string): Promise<void>;
}
interface KozoRedis {
    /** Cache operations. */
    readonly cache: KozoCache;
    /** Pub/Sub operations. */
    readonly pubsub: KozoPubSub;
    /** Distributed rate-limit store. */
    readonly rateLimit: RateLimitStore;
    /** Access the underlying ioredis instance (escape hatch). */
    readonly raw: unknown;
    /** Gracefully close all connections. */
    close(): Promise<void>;
}
interface RedisPluginOptions {
    /** Redis connection config. */
    connection: string | Record<string, unknown>;
    /** Key prefix (default: 'kozo:'). */
    prefix?: string;
    /** Close timeout in ms (default: 5000). */
    closeTimeout?: number;
}

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
declare function createRedis(config: RedisConfig): Promise<KozoRedis>;

/**
 * Kozo plugin that creates a KozoRedis instance and wires shutdown.
 *
 * ```ts
 * import { redisPlugin } from '@kozojs/redis';
 *
 * app.use(redisPlugin({
 *   connection: process.env.REDIS_URL ?? 'redis://localhost:6379',
 *   prefix: 'myapp:',
 * }));
 * ```
 *
 * The plugin registers a cleanup hook so Redis connections
 * are closed during graceful shutdown (after draining HTTP requests).
 */
declare function redisPlugin(options: RedisPluginOptions & {
    onReady?: (redis: KozoRedis) => void;
}): {
    name: string;
    version: string;
    install(app: any): Promise<void>;
};

/**
 * Create a cache backed by an ioredis instance.
 * All keys are prefixed with the given prefix.
 */
declare function createCache(redis: any, prefix: string): KozoCache;

/**
 * Create a pub/sub layer that uses a dedicated ioredis subscriber connection.
 *
 * ioredis requires a separate connection for subscriptions because
 * a connection in subscribe mode can't execute regular commands.
 * We create the subscriber lazily on first subscribe() call.
 */
declare function createPubSub(publishRedis: any, createSubscriber: () => any): KozoPubSub;

/**
 * Distributed rate-limit store backed by Redis.
 *
 * Uses a single EVALSHA (Lua script) per request for atomicity:
 *   INCR key → if count == 1, set PEXPIRE → return [count, pttl]
 *
 * This avoids race conditions that would occur with separate
 * GET + INCR + EXPIRE calls.
 */
declare function createRateLimitStore(redis: any, prefix: string): RateLimitStore;

export { type KozoCache, type KozoPubSub, type KozoRedis, type PubSubHandler, type RateLimitStore, type RateLimitStoreRecord, type RedisConfig, type RedisPluginOptions, createCache, createPubSub, createRateLimitStore, createRedis, redisPlugin };
