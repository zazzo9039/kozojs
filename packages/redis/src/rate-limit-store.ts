import type { RateLimitStore, RateLimitStoreRecord } from './types.js';

/**
 * Distributed rate-limit store backed by Redis.
 *
 * Uses a single EVALSHA (Lua script) per request for atomicity:
 *   INCR key → if count == 1, set PEXPIRE → return [count, pttl]
 *
 * This avoids race conditions that would occur with separate
 * GET + INCR + EXPIRE calls.
 */
export function createRateLimitStore(redis: any, prefix: string): RateLimitStore {
  function k(key: string) { return prefix + 'rl:' + key; }

  // Lua script: atomic increment + set TTL if new key
  const LUA_INCREMENT = `
    local key = KEYS[1]
    local windowMs = tonumber(ARGV[1])
    local count = redis.call('INCR', key)
    if count == 1 then
      redis.call('PEXPIRE', key, windowMs)
    end
    local pttl = redis.call('PTTL', key)
    return {count, pttl}
  `;

  return {
    async increment(key: string, windowMs: number): Promise<RateLimitStoreRecord> {
      const [count, pttl] = await redis.eval(LUA_INCREMENT, 1, k(key), windowMs) as [number, number];
      const resetAt = Date.now() + Math.max(pttl, 0);
      return { count, resetAt };
    },

    async reset(key: string): Promise<void> {
      await redis.del(k(key));
    },
  };
}
