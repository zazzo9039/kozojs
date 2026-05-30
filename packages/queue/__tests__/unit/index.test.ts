import { describe, it, expect, vi } from 'vitest';

// Mock the adapter modules
vi.mock('../../src/adapters/redis.js', () => ({
  createRedisAdapter: vi.fn().mockReturnValue({
    name: 'redis',
    queueName: 'test',
    add: vi.fn(),
    process: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/adapters/amqp.js', () => ({
  createAmqpAdapter: vi.fn().mockReturnValue({
    name: 'amqp',
    queueName: 'test',
    add: vi.fn(),
    process: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  }),
}));

import { createQueue } from '../../src/index.js';

describe('createQueue facade', () => {
  it('dispatches to redis adapter', () => {
    const adapter = createQueue('emails', {
      adapter: 'redis',
      connection: { host: 'localhost' },
    });
    expect(adapter.name).toBe('redis');
  });

  it('dispatches to amqp adapter', () => {
    const adapter = createQueue('tasks', {
      adapter: 'amqp',
      connection: 'amqp://localhost',
    });
    expect(adapter.name).toBe('amqp');
  });

  it('throws on unknown adapter', () => {
    expect(() =>
      createQueue('test', { adapter: 'kafka' as any, connection: '' }),
    ).toThrow('Unknown adapter');
  });
});
