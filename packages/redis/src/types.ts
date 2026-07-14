// ── Redis connection options ──────────────────────────────────────────────────

export interface RedisConfig {
  /** ioredis connection URL (redis://...) or options object. */
  connection: string | Record<string, unknown>;
  /** Key prefix for all operations (default: none). */
  prefix?: string;
  /** Lazy connect — don't open TCP until first command (default: true). */
  lazyConnect?: boolean;
}

// ── Cache ────────────────────────────────────────────────────────────────────

export interface KozoCache {
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

// ── Pub/Sub ──────────────────────────────────────────────────────────────────

export type PubSubHandler<T = unknown> = (data: T, channel: string) => void;

export interface KozoPubSub {
  /** Publish JSON-serializable data to a channel. Returns receiver count. */
  publish<T = unknown>(channel: string, data: T): Promise<number>;
  /** Subscribe to a channel. Returns unsubscribe function. */
  subscribe<T = unknown>(channel: string, handler: PubSubHandler<T>): () => void;
  /**
   * Subscribe to a glob-style channel pattern (e.g. `'user.*'`, `'room.?'`).
   * The handler receives the concrete channel that matched. Returns unsubscribe.
   */
  psubscribe<T = unknown>(pattern: string, handler: PubSubHandler<T>): () => void;
}

// ── Rate-limit store ─────────────────────────────────────────────────────────

export interface RateLimitStoreRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  /** Increment and return { count, resetAt } for a key within a window. */
  increment(key: string, windowMs: number): Promise<RateLimitStoreRecord>;
  /** Reset a specific key (for testing / admin). */
  reset(key: string): Promise<void>;
}

// ── Unified client ───────────────────────────────────────────────────────────

export interface KozoRedis {
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

// ── Plugin options ───────────────────────────────────────────────────────────

export interface RedisPluginOptions {
  /** Redis connection config. */
  connection: string | Record<string, unknown>;
  /** Key prefix (default: 'kozo:'). */
  prefix?: string;
  /** Close timeout in ms (default: 5000). */
  closeTimeout?: number;
}
