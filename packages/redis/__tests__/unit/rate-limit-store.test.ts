import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimitStore } from '../../src/rate-limit-store.js';

describe('createRateLimitStore', () => {
  let mockRedis: any;
  let store: ReturnType<typeof createRateLimitStore>;

  beforeEach(() => {
    mockRedis = {
      eval: vi.fn(),
      del: vi.fn(),
    };
    store = createRateLimitStore(mockRedis, 'app:');
  });

  it('increment() calls Lua script and returns record', async () => {
    mockRedis.eval.mockResolvedValue([1, 60000]);

    const before = Date.now();
    const record = await store.increment('ip:127.0.0.1', 60_000);
    const after = Date.now();

    expect(record.count).toBe(1);
    expect(record.resetAt).toBeGreaterThanOrEqual(before + 60000);
    expect(record.resetAt).toBeLessThanOrEqual(after + 60000);

    // Verify the Lua script was called with the right key and window
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      'app:rl:ip:127.0.0.1',
      60000,
    );
  });

  it('increment() second call returns incremented count', async () => {
    mockRedis.eval.mockResolvedValue([5, 45000]);
    const record = await store.increment('ip:1.2.3.4', 60_000);
    expect(record.count).toBe(5);
  });

  it('reset() deletes the key', async () => {
    await store.reset('ip:127.0.0.1');
    expect(mockRedis.del).toHaveBeenCalledWith('app:rl:ip:127.0.0.1');
  });
});
