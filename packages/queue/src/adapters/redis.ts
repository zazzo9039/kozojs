import type { QueueAdapter, KozoJob, QueueAdapterEvents, RedisAdapterConfig } from '../types.js';
import { resolveRedisConnection } from '../connection.js';

export function createRedisAdapter<TData = unknown>(
  queueName: string,
  config: Omit<RedisAdapterConfig, 'adapter'>,
): QueueAdapter<TData> {
  const connection = resolveRedisConnection(config.connection);

  // Lazy-load BullMQ — it's an optional peer dependency
  let bullmqPromise: Promise<typeof import('bullmq')> | undefined;
  function getBullMQ() {
    if (!bullmqPromise) {
      bullmqPromise = import('bullmq').catch((e) => {
        throw new Error(
          '[kozo:queue] bullmq is required for the Redis adapter. Install it: npm install bullmq',
          { cause: e },
        );
      });
    }
    return bullmqPromise;
  }

  let queue: any;
  let worker: any;
  let queueEvents: any;

  // Buffer error listeners registered before process() creates the worker
  const pendingErrorListeners: Array<QueueAdapterEvents<TData>['error']> = [];

  async function ensureQueue() {
    if (queue) return queue;
    const { Queue } = await getBullMQ();
    queue = new Queue(queueName, {
      ...config.bullmq,
      connection,
      defaultJobOptions: config.defaultJobOptions ?? {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      },
    });
    return queue;
  }

  function wrapJob(job: { id?: string; name: string; data: any; attemptsMade: number }): KozoJob<TData> {
    return {
      id: job.id ?? '',
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      raw: job,
    };
  }

  // Promise-based lazy QueueEvents initialization
  let queueEventsPromise: Promise<any> | undefined;
  function ensureQueueEvents(): Promise<any> {
    if (queueEvents) return Promise.resolve(queueEvents);
    if (!queueEventsPromise) {
      queueEventsPromise = (async () => {
        const { QueueEvents } = await getBullMQ();
        queueEvents = new QueueEvents(queueName, { connection });
        return queueEvents;
      })();
    }
    return queueEventsPromise;
  }

  const adapter: QueueAdapter<TData> = {
    name: 'redis',
    queueName,

    async add(jobName, data, options) {
      const q = await ensureQueue();
      const opts: Record<string, unknown> = {};
      if (options?.delay != null) opts.delay = options.delay;
      if (options?.attempts != null) opts.attempts = options.attempts;
      if (options?.priority != null) opts.priority = options.priority;
      if (options?.jobId != null) opts.jobId = options.jobId;
      const job = await q.add(jobName, data, opts);
      return job.id ?? '';
    },

    async process(handler, options) {
      if (worker) throw new Error(`[kozo:queue] Worker already started for "${queueName}"`);
      const { Worker } = await getBullMQ();
      worker = new Worker(
        queueName,
        async (job: any) => handler(wrapJob(job)),
        { connection, concurrency: options?.concurrency ?? 1 },
      );
      // Attach any buffered error listeners
      for (const fn of pendingErrorListeners) {
        worker.on('error', fn);
      }
      pendingErrorListeners.length = 0;
    },

    on(event, listener) {
      // Error events go to the worker
      if (event === 'error') {
        if (worker) {
          worker.on('error', listener as QueueAdapterEvents<TData>['error']);
          return () => { worker?.off('error', listener as QueueAdapterEvents<TData>['error']); };
        }
        // Buffer until process() is called
        pendingErrorListeners.push(listener as QueueAdapterEvents<TData>['error']);
        return () => {
          const idx = pendingErrorListeners.indexOf(listener as QueueAdapterEvents<TData>['error']);
          if (idx >= 0) pendingErrorListeners.splice(idx, 1);
          worker?.off('error', listener as QueueAdapterEvents<TData>['error']);
        };
      }

      // Lazily create QueueEvents on first subscription
      if (event === 'completed') {
        const bullListener = async ({ jobId }: { jobId: string }) => {
          const q = await ensureQueue();
          const job = await q.getJob(jobId);
          if (job) (listener as QueueAdapterEvents<TData>['completed'])(wrapJob(job));
        };
        ensureQueueEvents().then((qe) => qe.on('completed', bullListener));
        return () => { ensureQueueEvents().then((qe) => qe.off('completed', bullListener)); };
      }

      if (event === 'failed') {
        const bullListener = async ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
          const q = await ensureQueue();
          const job = await q.getJob(jobId);
          const kozoJob: KozoJob<TData> = job
            ? wrapJob(job)
            : { id: jobId, name: '', data: {} as TData, attemptsMade: 0, raw: null };
          (listener as QueueAdapterEvents<TData>['failed'])(kozoJob, new Error(failedReason));
        };
        ensureQueueEvents().then((qe) => qe.on('failed', bullListener));
        return () => { ensureQueueEvents().then((qe) => qe.off('failed', bullListener)); };
      }

      return () => {};
    },

    async close() {
      await Promise.all([
        worker?.close(),
        queueEvents?.close(),
        queue?.close(),
      ]);
    },

    async pause() {
      await worker?.pause();
    },

    async resume() {
      worker?.resume();
    },
  };

  return adapter;
}
