// ── Factory ──────────────────────────────────────────────────────────────────
export { createRedis } from './client.js';

// ── Plugin ───────────────────────────────────────────────────────────────────
export { redisPlugin } from './plugin.js';

// ── Sub-modules (for advanced / standalone use) ──────────────────────────────
export { createCache } from './cache.js';
export { createPubSub } from './pubsub.js';
export { createRateLimitStore } from './rate-limit-store.js';

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  RedisConfig,
  KozoRedis,
  KozoCache,
  KozoPubSub,
  PubSubHandler,
  RateLimitStore,
  RateLimitStoreRecord,
  RedisPluginOptions,
} from './types.js';
