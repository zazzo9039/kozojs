import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClose, mockRedisInstance } = vi.hoisted(() => {
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockRedisInstance = {
    cache: {},
    pubsub: {},
    rateLimit: {},
    raw: {},
    close: mockClose,
  };
  return { mockClose, mockRedisInstance };
});

vi.mock('../../src/client.js', () => ({
  createRedis: vi.fn().mockResolvedValue(mockRedisInstance),
}));

import { redisPlugin } from '../../src/plugin.js';

describe('redisPlugin', () => {
  let mockAddCleanupHook: ReturnType<typeof vi.fn>;
  let mockApp: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddCleanupHook = vi.fn();
    mockApp = {
      getShutdownManager: () => ({
        addCleanupHook: mockAddCleanupHook,
      }),
    };
  });

  it('has correct name and version', () => {
    const plugin = redisPlugin({ connection: 'redis://localhost' });
    expect(plugin.name).toBe('@kozojs/redis');
    expect(plugin.version).toBe('0.1.0');
  });

  it('install() creates redis instance and registers cleanup hook', async () => {
    const plugin = redisPlugin({ connection: 'redis://localhost' });
    await plugin.install(mockApp);
    expect(mockAddCleanupHook).toHaveBeenCalledTimes(1);
  });

  it('install() calls onReady with the redis instance', async () => {
    const onReady = vi.fn();
    const plugin = redisPlugin({ connection: 'redis://localhost', onReady });
    await plugin.install(mockApp);
    expect(onReady).toHaveBeenCalledWith(mockRedisInstance);
  });

  it('cleanup hook calls close()', async () => {
    const plugin = redisPlugin({ connection: 'redis://localhost' });
    await plugin.install(mockApp);

    const cleanupFn = mockAddCleanupHook.mock.calls[0][0];
    await cleanupFn();
    expect(mockClose).toHaveBeenCalled();
  });

  it('cleanup hook respects close timeout', async () => {
    vi.useFakeTimers();
    const plugin = redisPlugin({ connection: 'redis://localhost', closeTimeout: 100 });
    await plugin.install(mockApp);

    // Make close hang
    mockClose.mockImplementation(() => new Promise(() => {}));

    const cleanupFn = mockAddCleanupHook.mock.calls[0][0];
    const cleanupPromise = cleanupFn();

    await vi.advanceTimersByTimeAsync(150);
    // Should resolve (timeout kicks in) instead of hanging
    await cleanupPromise;

    vi.useRealTimers();
  });
});
