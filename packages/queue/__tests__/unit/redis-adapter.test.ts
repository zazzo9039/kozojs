import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ before import
const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockQueueGetJob = vi.fn();

const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockWorkerPause = vi.fn().mockResolvedValue(undefined);
const mockWorkerResume = vi.fn();
const mockWorkerOn = vi.fn();
const mockWorkerOff = vi.fn();

const mockQueueEventsClose = vi.fn().mockResolvedValue(undefined);
const mockQueueEventsOn = vi.fn();
const mockQueueEventsOff = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
    getJob: mockQueueGetJob,
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: mockWorkerClose,
    pause: mockWorkerPause,
    resume: mockWorkerResume,
    on: mockWorkerOn,
    off: mockWorkerOff,
  })),
  QueueEvents: vi.fn().mockImplementation(() => ({
    close: mockQueueEventsClose,
    on: mockQueueEventsOn,
    off: mockQueueEventsOff,
  })),
}));

// Import after mock
import { createRedisAdapter } from '../../src/adapters/redis.js';

describe('createRedisAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns adapter with correct name and queueName', () => {
    const adapter = createRedisAdapter('test-queue', {
      connection: { host: 'localhost', port: 6379 },
    });
    expect(adapter.name).toBe('redis');
    expect(adapter.queueName).toBe('test-queue');
  });

  it('add() lazily creates queue and enqueues a job', async () => {
    const adapter = createRedisAdapter('emails', {
      connection: { host: 'localhost' },
    });
    // Queue not created yet (lazy)
    const { Queue } = await import('bullmq');
    const callsBefore = (Queue as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    const id = await adapter.add('welcome', { to: 'user@test.com' });
    expect(id).toBe('job-1');

    // Queue should now be created
    expect((Queue as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'welcome',
      { to: 'user@test.com' },
      expect.objectContaining({}),
    );
  });

  it('add() passes delay, priority, attempts, jobId', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    await adapter.add('task', { x: 1 }, {
      delay: 5000,
      priority: 1,
      attempts: 5,
      jobId: 'custom-id',
    });
    expect(mockQueueAdd).toHaveBeenCalledWith('task', { x: 1 }, {
      delay: 5000,
      priority: 1,
      attempts: 5,
      jobId: 'custom-id',
    });
  });

  it('process() creates a worker', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    const handler = vi.fn().mockResolvedValue('done');
    await adapter.process(handler, { concurrency: 3 });

    const { Worker } = await import('bullmq');
    expect(Worker).toHaveBeenCalledWith(
      'jobs',
      expect.any(Function),
      expect.objectContaining({ concurrency: 3 }),
    );
  });

  it('process() called twice throws', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    await expect(adapter.process(vi.fn().mockResolvedValue(undefined))).rejects.toThrow(
      'Worker already started',
    );
  });

  it('on("error") before process() buffers listener and attaches after', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    const errorHandler = vi.fn();

    // Register error handler before any worker exists
    adapter.on('error', errorHandler);
    // Worker doesn't exist yet, so mockWorkerOn shouldn't have been called
    expect(mockWorkerOn).not.toHaveBeenCalled();

    // Now create the worker — buffered listeners should be attached
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    expect(mockWorkerOn).toHaveBeenCalledWith('error', errorHandler);
  });

  it('on("completed") lazily creates QueueEvents', () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    const unsub = adapter.on('completed', vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('on() returns unsubscribe function', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });

    const unsub = adapter.on('completed', vi.fn());
    // Wait for async QueueEvents initialization
    await new Promise((r) => setTimeout(r, 50));

    unsub();
    // unsub triggers an async .then() — give it a tick to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(mockQueueEventsOff).toHaveBeenCalledWith('completed', expect.any(Function));
  });

  it('close() closes queue, worker, and queueEvents', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    // Trigger lazy queue creation
    await adapter.add('init', {});
    // Start a worker and subscribe to events to create all instances
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    adapter.on('completed', vi.fn());
    // Wait for async QueueEvents initialization
    await new Promise((r) => setTimeout(r, 50));

    await adapter.close();
    expect(mockQueueClose).toHaveBeenCalled();
    expect(mockWorkerClose).toHaveBeenCalled();
    expect(mockQueueEventsClose).toHaveBeenCalled();
  });

  it('pause() delegates to worker', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    await adapter.pause!();
    expect(mockWorkerPause).toHaveBeenCalled();
  });

  it('resume() delegates to worker', async () => {
    const adapter = createRedisAdapter('jobs', {
      connection: { host: 'localhost' },
    });
    await adapter.process(vi.fn().mockResolvedValue(undefined));
    adapter.resume!();
    expect(mockWorkerResume).toHaveBeenCalled();
  });
});
