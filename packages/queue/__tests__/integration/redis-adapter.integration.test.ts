import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { createQueue } from '../../src/index.js';
import { createRedisAdapter } from '../../src/adapters/redis.js';
import type { QueueAdapter } from '../../src/types.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Collect adapters for cleanup
const adapters: QueueAdapter[] = [];

function tracked<T>(adapter: QueueAdapter<T>) {
  adapters.push(adapter as QueueAdapter);
  return adapter;
}

beforeAll(async () => {
  // Quick connectivity check — fail fast if Redis is not reachable
  const probe = createRedisAdapter('__probe__', { connection: REDIS_URL });
  await probe.add('ping', {} as any);
  await probe.close();
});

afterEach(async () => {
  await Promise.allSettled(adapters.map((a) => a.close()));
  adapters.length = 0;
});

// ─── createQueue factory ─────────────────────────────────────────────────────

describe('createQueue() with Redis', () => {
  it('creates a redis adapter via the unified factory', async () => {
    const q = tracked(
      createQueue('factory-test', { adapter: 'redis', connection: REDIS_URL }),
    );
    expect(q.name).toBe('redis');
    expect(q.queueName).toBe('factory-test');
  });
});

// ─── add / process ───────────────────────────────────────────────────────────

describe('Redis adapter: add + process', () => {
  it('enqueues a job and processes it', async () => {
    const q = tracked(createRedisAdapter('add-process', { connection: REDIS_URL }));

    const result = new Promise<{ id: string; name: string; data: unknown }>((resolve) => {
      q.process(async (job) => {
        resolve({ id: job.id, name: job.name, data: job.data });
        return 'ok' as any;
      });
    });

    const jobId = await q.add('greet', { msg: 'hello' });
    expect(jobId).toBeTruthy();

    const processed = await result;
    expect(processed.name).toBe('greet');
    expect(processed.data).toEqual({ msg: 'hello' });
  });

  it('passes delay option (job not immediately visible)', async () => {
    const q = tracked(createRedisAdapter('delay-test', { connection: REDIS_URL }));

    const received: string[] = [];
    await q.process(async (job) => {
      received.push(job.name);
      return undefined as any;
    });

    // 200ms delay — should NOT be processed within ~50ms
    await q.add('delayed', { x: 1 }, { delay: 200 });
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(0);

    // After another ~250ms it should have been processed
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toContain('delayed');
  });

  it('retries on failure up to configured attempts', async () => {
    const q = tracked(
      createRedisAdapter('retry-test-' + Date.now(), {
        connection: REDIS_URL,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'fixed', delay: 50 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      }),
    );

    let calls = 0;
    const done = new Promise<number>((resolve) => {
      q.process(async () => {
        calls++;
        if (calls < 3) throw new Error('transient');
        resolve(calls);
        return undefined as any;
      });
    });

    await q.add('will-retry', { v: 1 });
    const totalCalls = await done;
    expect(totalCalls).toBe(3);
  }, 15_000);

  it('process() called twice throws', async () => {
    const q = tracked(createRedisAdapter('dup-worker', { connection: REDIS_URL }));
    await q.process(async () => undefined as any);
    await expect(q.process(async () => undefined as any)).rejects.toThrow('Worker already started');
  });
});

// ─── Events ──────────────────────────────────────────────────────────────────

describe('Redis adapter: events', () => {
  it('fires "completed" when job finishes', async () => {
    const q = tracked(createRedisAdapter('evt-completed', { connection: REDIS_URL }));

    const completedPromise = new Promise<string>((resolve) => {
      q.on('completed', (job) => resolve(job.name));
    });

    await q.process(async () => 'done' as any);
    await q.add('my-job', {});

    const name = await completedPromise;
    expect(name).toBe('my-job');
  });

  it('fires "failed" when job exhausts retries', async () => {
    const q = tracked(
      createRedisAdapter('evt-failed-' + Date.now(), {
        connection: REDIS_URL,
        defaultJobOptions: {
          attempts: 1,
          backoff: { type: 'fixed', delay: 50 },
        },
      }),
    );

    const failedPromise = new Promise<{ name: string; error: string }>((resolve) => {
      q.on('failed', (job, err) => resolve({ name: job.name, error: err.message }));
    });

    await q.process(async () => {
      throw new Error('boom');
    });

    // Small delay to let QueueEvents connect to Redis stream
    await new Promise((r) => setTimeout(r, 200));
    await q.add('fail-job', {});

    const { name, error } = await failedPromise;
    expect(name).toBe('fail-job');
    expect(error).toBe('boom');
  }, 15_000);

  it('on() returns an unsubscribe function', async () => {
    const q = tracked(createRedisAdapter('evt-unsub', { connection: REDIS_URL }));
    const unsub = q.on('completed', () => {});
    expect(typeof unsub).toBe('function');
    unsub(); // should not throw
  });
});

// ─── Pause / Resume ─────────────────────────────────────────────────────────

describe('Redis adapter: pause / resume', () => {
  it('pause() stops processing, resume() restarts', async () => {
    const q = tracked(createRedisAdapter('pause-test', { connection: REDIS_URL }));
    const processed: string[] = [];

    await q.process(async (job) => {
      processed.push(job.name);
      return undefined as any;
    });

    // Pause, add a job, verify it's NOT processed quickly
    await q.pause!();
    await q.add('while-paused', {});
    await new Promise((r) => setTimeout(r, 300));
    expect(processed).not.toContain('while-paused');

    // Resume, job should be processed
    q.resume!();
    await new Promise((r) => setTimeout(r, 1000));
    expect(processed).toContain('while-paused');
  });
});

// ─── Connection string parsing ──────────────────────────────────────────────

describe('Redis adapter: connection formats', () => {
  it('works with redis:// URL string', async () => {
    const q = tracked(createRedisAdapter('url-test', { connection: 'redis://localhost:6379' }));
    const id = await q.add('ping', {});
    expect(id).toBeTruthy();
  });

  it('works with host/port object', async () => {
    const q = tracked(
      createRedisAdapter('obj-test', { connection: { host: 'localhost', port: 6379 } }),
    );
    const id = await q.add('ping', {});
    expect(id).toBeTruthy();
  });
});

// ─── Concurrency ────────────────────────────────────────────────────────────

describe('Redis adapter: concurrency', () => {
  it('processes multiple jobs concurrently', async () => {
    const q = tracked(createRedisAdapter('concurrency', { connection: REDIS_URL }));
    const concurrent: number[] = [];
    let active = 0;

    const allDone = new Promise<void>((resolve) => {
      let completed = 0;
      q.process(async () => {
        active++;
        concurrent.push(active);
        await new Promise((r) => setTimeout(r, 100));
        active--;
        completed++;
        if (completed >= 3) resolve();
        return undefined as any;
      }, { concurrency: 3 });
    });

    await q.add('a', {});
    await q.add('b', {});
    await q.add('c', {});

    await allDone;
    // At some point, more than one job was active simultaneously
    expect(Math.max(...concurrent)).toBeGreaterThanOrEqual(2);
  });
});
