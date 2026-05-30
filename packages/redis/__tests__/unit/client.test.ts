import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis before importing client
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockQuit = vi.fn().mockResolvedValue('OK');
const mockDuplicate = vi.fn();
const mockDefineCommand = vi.fn();

const mockRedisInstance = {
  connect: mockConnect,
  quit: mockQuit,
  duplicate: mockDuplicate,
  defineCommand: mockDefineCommand,
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  ttl: vi.fn(),
  publish: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
};

mockDuplicate.mockReturnValue({
  ...mockRedisInstance,
  quit: vi.fn().mockResolvedValue('OK'),
});

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}));

describe('createRedis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a KozoRedis instance with cache, pubsub, rateLimit, and raw', async () => {
    const { createRedis } = await import('../../src/client.js');
    const redis = await createRedis({ connection: 'redis://localhost:6379' });

    expect(redis).toHaveProperty('cache');
    expect(redis).toHaveProperty('pubsub');
    expect(redis).toHaveProperty('rateLimit');
    expect(redis).toHaveProperty('raw');
    expect(redis).toHaveProperty('close');
    expect(typeof redis.close).toBe('function');
  });

  it('connects by default', async () => {
    const { createRedis } = await import('../../src/client.js');
    await createRedis({ connection: 'redis://localhost:6379' });
    expect(mockConnect).toHaveBeenCalled();
  });

  it('close() calls quit on the client', async () => {
    const { createRedis } = await import('../../src/client.js');
    const redis = await createRedis({ connection: 'redis://localhost:6379' });
    await redis.close();
    expect(mockQuit).toHaveBeenCalled();
  });
});
