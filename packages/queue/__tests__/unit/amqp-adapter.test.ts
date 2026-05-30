import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock amqplib
const mockAck = vi.fn();
const mockNack = vi.fn();
const mockSendToQueue = vi.fn().mockReturnValue(true);
const mockPublish = vi.fn().mockReturnValue(true);
const mockConsume = vi.fn().mockResolvedValue({ consumerTag: 'tag-1' });
const mockCancel = vi.fn().mockResolvedValue(undefined);
const mockChannelClose = vi.fn().mockResolvedValue(undefined);
const mockAssertQueue = vi.fn().mockResolvedValue({ queue: 'test' });
const mockAssertExchange = vi.fn().mockResolvedValue(undefined);
const mockBindQueue = vi.fn().mockResolvedValue(undefined);
const mockPrefetch = vi.fn().mockResolvedValue(undefined);

const mockConnectionClose = vi.fn().mockResolvedValue(undefined);
const mockConnectionOn = vi.fn();

const mockChannel = {
  assertQueue: mockAssertQueue,
  assertExchange: mockAssertExchange,
  bindQueue: mockBindQueue,
  prefetch: mockPrefetch,
  sendToQueue: mockSendToQueue,
  publish: mockPublish,
  consume: mockConsume,
  ack: mockAck,
  nack: mockNack,
  cancel: mockCancel,
  close: mockChannelClose,
  on: vi.fn(),
};

vi.mock('amqplib', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      createChannel: vi.fn().mockResolvedValue(mockChannel),
      close: mockConnectionClose,
      on: mockConnectionOn,
    }),
  },
  connect: vi.fn().mockResolvedValue({
    createChannel: vi.fn().mockResolvedValue(mockChannel),
    close: mockConnectionClose,
    on: mockConnectionOn,
  }),
}));

import { createAmqpAdapter } from '../../src/adapters/amqp.js';

describe('createAmqpAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset consume mock to default
    mockConsume.mockResolvedValue({ consumerTag: 'tag-1' });
  });

  it('returns adapter with correct name and queueName', () => {
    const adapter = createAmqpAdapter('test-queue', {
      connection: 'amqp://localhost',
    });
    expect(adapter.name).toBe('amqp');
    expect(adapter.queueName).toBe('test-queue');
  });

  it('add() sends JSON message to queue', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    const id = await adapter.add('process', { value: 42 });
    expect(typeof id).toBe('string');
    expect(mockSendToQueue).toHaveBeenCalledWith(
      'tasks',
      expect.any(Buffer),
      expect.objectContaining({ persistent: true }),
    );

    // Verify message content
    const sentBuffer = mockSendToQueue.mock.calls[0][1];
    const parsed = JSON.parse(sentBuffer.toString());
    expect(parsed.name).toBe('process');
    expect(parsed.data).toEqual({ value: 42 });
    expect(parsed.attempts).toBe(3);
  });

  it('add() with exchange publishes to exchange', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
      exchange: 'my-exchange',
      exchangeType: 'direct',
    });
    await adapter.add('task', { x: 1 });
    expect(mockAssertExchange).toHaveBeenCalledWith('my-exchange', 'direct', { durable: true });
    expect(mockPublish).toHaveBeenCalledWith(
      'my-exchange',
      'tasks',
      expect.any(Buffer),
      expect.any(Object),
    );
  });

  it('add() with delay throws (not supported on AMQP)', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    await expect(adapter.add('delayed', { x: 1 }, { delay: 5000 })).rejects.toThrow(
      'does not support the "delay" option',
    );
  });

  it('add() with custom jobId uses it as messageId', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    await adapter.add('task', {}, { jobId: 'my-id-123' });
    expect(mockSendToQueue).toHaveBeenCalledWith(
      'tasks',
      expect.any(Buffer),
      expect.objectContaining({ messageId: 'my-id-123' }),
    );
  });

  it('process() sets up consumer and ack on success', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    const handler = vi.fn().mockResolvedValue('done');

    await adapter.process(handler);
    expect(mockConsume).toHaveBeenCalledWith('tasks', expect.any(Function));

    // Simulate a message
    const consumeHandler = mockConsume.mock.calls[0][1];
    const msg = {
      content: Buffer.from(JSON.stringify({ id: 'j1', name: 'task', data: { x: 1 }, attempts: 3, attemptsMade: 0 })),
      properties: { messageId: 'j1' },
      fields: {},
    };
    await consumeHandler(msg);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      id: 'j1',
      name: 'task',
      data: { x: 1 },
    }));
    expect(mockAck).toHaveBeenCalledWith(msg);
  });

  it('process() nack + delayed requeue on failure under attempt limit', async () => {
    vi.useFakeTimers();
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
      retryBackoffMs: 100,
    });
    const handler = vi.fn().mockRejectedValue(new Error('boom'));

    await adapter.process(handler);
    const consumeHandler = mockConsume.mock.calls[0][1];
    const msg = {
      content: Buffer.from(JSON.stringify({ id: 'j1', name: 'task', data: {}, attempts: 3, attemptsMade: 0 })),
      properties: { messageId: 'j1' },
      fields: {},
    };
    await consumeHandler(msg);

    // Should NOT have acked or re-published yet (backoff pending)
    expect(mockAck).not.toHaveBeenCalledWith(msg);
    expect(mockSendToQueue).not.toHaveBeenCalled();

    // Advance timers past the backoff delay (100ms * 2^0 = 100ms)
    await vi.advanceTimersByTimeAsync(150);
    // Retry message sent first, then original acked
    expect(mockSendToQueue).toHaveBeenCalled();
    expect(mockAck).toHaveBeenCalledWith(msg);
    expect(mockNack).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('process() nack without requeue on final failure', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    const handler = vi.fn().mockRejectedValue(new Error('final fail'));
    const failedSpy = vi.fn();
    adapter.on('failed', failedSpy);

    await adapter.process(handler);
    const consumeHandler = mockConsume.mock.calls[0][1];
    const msg = {
      content: Buffer.from(JSON.stringify({ id: 'j1', name: 'task', data: {}, attempts: 3, attemptsMade: 2 })),
      properties: { messageId: 'j1' },
      fields: {},
    };
    await consumeHandler(msg);

    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
    expect(failedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'j1' }),
      expect.any(Error),
    );
  });

  it('process() called twice throws', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    await expect(adapter.process(vi.fn().mockResolvedValue(undefined))).rejects.toThrow(
      'Consumer already started',
    );
  });

  it('process() nacks unparseable messages', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    const consumeHandler = mockConsume.mock.calls[0][1];
    const msg = {
      content: Buffer.from('not-json'),
      properties: {},
      fields: {},
    };
    await consumeHandler(msg);
    expect(mockNack).toHaveBeenCalledWith(msg, false, false);
  });

  it('on() returns unsubscribe function', () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    const listener = vi.fn();
    const unsub = adapter.on('completed', listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('close() cancels consumer and closes channel/connection', async () => {
    const adapter = createAmqpAdapter('tasks', {
      connection: 'amqp://localhost',
    });
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    await adapter.close();
    expect(mockCancel).toHaveBeenCalledWith('tag-1');
    expect(mockChannelClose).toHaveBeenCalled();
    expect(mockConnectionClose).toHaveBeenCalled();
  });
});
