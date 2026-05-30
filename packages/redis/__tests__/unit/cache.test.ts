import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../../src/cache.js';

describe('createCache', () => {
  let mockRedis: any;
  let cache: ReturnType<typeof createCache>;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      ttl: vi.fn(),
    };
    cache = createCache(mockRedis, 'test:');
  });

  // ── get ───────────────────────────────────────────────────────────────────

  it('get() returns parsed JSON on hit', async () => {
    mockRedis.get.mockResolvedValue('{"name":"Alice"}');
    const result = await cache.get<{ name: string }>('user:1');
    expect(result).toEqual({ name: 'Alice' });
    expect(mockRedis.get).toHaveBeenCalledWith('test:user:1');
  });

  it('get() returns undefined on miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('get() returns raw string if not valid JSON', async () => {
    mockRedis.get.mockResolvedValue('plain-text');
    expect(await cache.get('key')).toBe('plain-text');
  });

  // ── set ───────────────────────────────────────────────────────────────────

  it('set() stores JSON without TTL', async () => {
    await cache.set('key', { x: 1 });
    expect(mockRedis.set).toHaveBeenCalledWith('test:key', '{"x":1}');
  });

  it('set() stores JSON with TTL', async () => {
    await cache.set('key', 'val', 60);
    expect(mockRedis.set).toHaveBeenCalledWith('test:key', '"val"', 'EX', 60);
  });

  it('set() ignores TTL <= 0', async () => {
    await cache.set('key', 'val', 0);
    expect(mockRedis.set).toHaveBeenCalledWith('test:key', '"val"');
  });

  // ── del ───────────────────────────────────────────────────────────────────

  it('del() deletes prefixed keys', async () => {
    mockRedis.del.mockResolvedValue(2);
    const count = await cache.del('a', 'b');
    expect(count).toBe(2);
    expect(mockRedis.del).toHaveBeenCalledWith('test:a', 'test:b');
  });

  it('del() with no keys returns 0', async () => {
    expect(await cache.del()).toBe(0);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  // ── has ───────────────────────────────────────────────────────────────────

  it('has() returns true when key exists', async () => {
    mockRedis.exists.mockResolvedValue(1);
    expect(await cache.has('key')).toBe(true);
  });

  it('has() returns false when key missing', async () => {
    mockRedis.exists.mockResolvedValue(0);
    expect(await cache.has('key')).toBe(false);
  });

  // ── ttl ───────────────────────────────────────────────────────────────────

  it('ttl() returns remaining seconds', async () => {
    mockRedis.ttl.mockResolvedValue(120);
    expect(await cache.ttl('key')).toBe(120);
    expect(mockRedis.ttl).toHaveBeenCalledWith('test:key');
  });

  it('ttl() returns -2 for missing key', async () => {
    mockRedis.ttl.mockResolvedValue(-2);
    expect(await cache.ttl('gone')).toBe(-2);
  });
});
