import type { KozoCache } from './types.js';

/**
 * Create a cache backed by an ioredis instance.
 * All keys are prefixed with the given prefix.
 */
export function createCache(redis: any, prefix: string): KozoCache {
  function k(key: string) { return prefix + key; }

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const raw = await redis.get(k(key));
      if (raw === null) return undefined;
      try { return JSON.parse(raw) as T; }
      catch { return raw as unknown as T; }
    },

    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      const serialized = JSON.stringify(value);
      if (ttlSeconds != null && ttlSeconds > 0) {
        await redis.set(k(key), serialized, 'EX', Math.ceil(ttlSeconds));
      } else {
        await redis.set(k(key), serialized);
      }
    },

    async del(...keys: string[]): Promise<number> {
      if (keys.length === 0) return 0;
      return redis.del(...keys.map(k));
    },

    async has(key: string): Promise<boolean> {
      return (await redis.exists(k(key))) === 1;
    },

    async ttl(key: string): Promise<number> {
      return redis.ttl(k(key));
    },
  };
}
