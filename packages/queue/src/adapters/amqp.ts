import type { QueueAdapter, KozoJob, QueueAdapterEvents, AmqpAdapterConfig, AmqpConnectOptions } from '../types.js';
import { resolveAmqpConnection } from '../connection.js';

// amqplib types used inline to avoid hard dependency at import time
interface AmqpConnection {
  createChannel(): Promise<AmqpChannel>;
  close(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
}

interface AmqpChannel {
  assertQueue(queue: string, options?: { durable?: boolean }): Promise<{ queue: string }>;
  assertExchange(exchange: string, type: string, options?: { durable?: boolean }): Promise<void>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<void>;
  prefetch(count: number): Promise<void>;
  sendToQueue(queue: string, content: Buffer, options?: Record<string, unknown>): boolean;
  publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean;
  consume(queue: string, handler: (msg: AmqpMessage | null) => void): Promise<{ consumerTag: string }>;
  ack(msg: AmqpMessage): void;
  nack(msg: AmqpMessage, allUpTo?: boolean, requeue?: boolean): void;
  cancel(consumerTag: string): Promise<void>;
  close(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
}

interface AmqpMessage {
  content: Buffer;
  properties: {
    messageId?: string;
    headers?: Record<string, unknown>;
    [key: string]: unknown;
  };
  fields: Record<string, unknown>;
}

export function createAmqpAdapter<TData = unknown>(
  queueName: string,
  config: Omit<AmqpAdapterConfig, 'adapter'>,
): QueueAdapter<TData> {
  const connUrl = resolveAmqpConnection(config.connection);
  const exchange = config.exchange ?? '';
  const exchangeType = config.exchangeType ?? 'direct';
  const durable = config.durable ?? true;
  const prefetch = config.prefetch ?? 1;
  const retryBackoffMs = config.retryBackoffMs ?? 1_000;

  let connection: AmqpConnection | undefined;
  let channel: AmqpChannel | undefined;
  let consumerTag: string | undefined;
  let closed = false;
  const eventListeners = new Map<string, Set<Function>>();

  // Store handler + options for reconnection replay
  let savedHandler: ((job: KozoJob<TData>) => Promise<unknown>) | undefined;
  let savedConcurrency: number | undefined;

  // Prevent concurrent ensureChannel() calls from spawning multiple connections
  let channelPromise: Promise<AmqpChannel> | undefined;

  async function ensureChannel(): Promise<AmqpChannel> {
    if (channel && !closed) return channel;

    // If a connection attempt is already in progress, wait for it
    if (channelPromise) return channelPromise;

    channelPromise = (async () => {
      // Dynamic import — amqplib is an optional peer dependency
      const amqplib = await import('amqplib').catch((e) => {
        throw new Error(
          '[kozo:queue] amqplib is required for the AMQP adapter. Install it: npm install amqplib',
          { cause: e },
        );
      });

      connection = await (amqplib.connect as any)(connUrl);

      // Handle connection errors/close for reconnection
      connection!.on('error', (err: Error) => {
        console.warn(`[kozo:queue] AMQP connection error on "${queueName}":`, err.message);
        channel = undefined;
        channelPromise = undefined;
      });
      connection!.on('close', () => {
        if (closed) return;
        console.warn(`[kozo:queue] AMQP connection closed unexpectedly for "${queueName}", will reconnect on next operation`);
        channel = undefined;
        connection = undefined;
        channelPromise = undefined;
        // If we had a consumer, try to re-establish it
        if (savedHandler && consumerTag) {
          consumerTag = undefined;
          setTimeout(() => {
            if (!closed && savedHandler) {
              startConsumer(savedHandler, savedConcurrency).catch((err) => {
                emit('error', err instanceof Error ? err : new Error(String(err)));
              });
            }
          }, retryBackoffMs);
        }
      });

      channel = await connection!.createChannel();
      await channel!.assertQueue(queueName, { durable });
      if (exchange) {
        await channel!.assertExchange(exchange, exchangeType, { durable });
        await channel!.bindQueue(queueName, exchange, queueName);
      }
      await channel!.prefetch(prefetch);

      // Handle channel errors — restart consumer if one was active
      channel!.on('error', (err: Error) => {
        console.warn(`[kozo:queue] AMQP channel error on "${queueName}":`, err.message);
        channel = undefined;
        channelPromise = undefined;
        if (consumerTag && savedHandler) {
          consumerTag = undefined;
          setTimeout(() => {
            if (!closed && savedHandler) {
              startConsumer(savedHandler, savedConcurrency).catch((reconnErr) => {
                emit('error', reconnErr instanceof Error ? reconnErr : new Error(String(reconnErr)));
              });
            }
          }, retryBackoffMs);
        }
      });

      return channel!;
    })();

    try {
      return await channelPromise;
    } catch (err) {
      channelPromise = undefined;
      throw err;
    }
  }

  function emit<E extends keyof QueueAdapterEvents<TData>>(
    event: E,
    ...args: Parameters<QueueAdapterEvents<TData>[E]>
  ) {
    const set = eventListeners.get(event);
    if (set) for (const fn of set) (fn as any)(...args);
  }

  async function startConsumer(
    handler: (job: KozoJob<TData>) => Promise<unknown>,
    concurrency?: number,
  ) {
    const ch = await ensureChannel();
    if (concurrency) await ch.prefetch(concurrency);

    const result = await ch.consume(queueName, async (msg) => {
      if (!msg) return;
      let parsed: any;
      try {
        parsed = JSON.parse(msg.content.toString());
      } catch {
        ch.nack(msg, false, false);
        return;
      }

      const job: KozoJob<TData> = {
        id: parsed.id ?? msg.properties.messageId ?? '',
        name: parsed.name ?? '',
        data: parsed.data,
        attemptsMade: parsed.attemptsMade ?? 0,
        raw: msg,
      };

      try {
        await handler(job);
        ch.ack(msg);
        emit('completed', job);
      } catch (err) {
        const maxAttempts = parsed.attempts ?? 3;
        if (job.attemptsMade + 1 < maxAttempts) {
          // Re-publish with incremented attempt count after backoff delay
          parsed.attemptsMade = (parsed.attemptsMade ?? 0) + 1;
          const attempt = parsed.attemptsMade;
          const delay = retryBackoffMs * Math.pow(2, attempt - 1);
          setTimeout(async () => {
            try {
              const updated = Buffer.from(JSON.stringify(parsed));
              const retryCh = await ensureChannel();
              retryCh.sendToQueue(queueName, updated, { persistent: durable, messageId: job.id });
              // Only ack original AFTER retry message is queued
              ch.ack(msg);
            } catch (retryErr) {
              // Requeue original so the message isn't lost
              ch.nack(msg, false, true);
              emit('error', retryErr instanceof Error ? retryErr : new Error(String(retryErr)));
            }
          }, delay);
        } else {
          ch.nack(msg, false, false);
          emit('failed', job, err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
    consumerTag = result.consumerTag;
  }

  const adapter: QueueAdapter<TData> = {
    name: 'amqp',
    queueName,

    async add(jobName, data, options) {
      if (options?.delay) {
        throw new Error(
          `[kozo:queue] The AMQP adapter does not support the "delay" option. ` +
          `Use the Redis adapter for delayed jobs, or implement a dead-letter exchange pattern manually.`,
        );
      }

      const ch = await ensureChannel();
      const jobId = options?.jobId ?? crypto.randomUUID();
      const message = Buffer.from(JSON.stringify({
        id: jobId,
        name: jobName,
        data,
        attempts: options?.attempts ?? 3,
        attemptsMade: 0,
      }));

      const publishOptions: Record<string, unknown> = {
        persistent: durable,
        messageId: jobId,
        headers: { 'x-job-name': jobName },
      };

      if (exchange) {
        ch.publish(exchange, queueName, message, publishOptions);
      } else {
        ch.sendToQueue(queueName, message, publishOptions);
      }
      return jobId;
    },

    async process(handler, options) {
      if (consumerTag) throw new Error(`[kozo:queue] Consumer already started for "${queueName}"`);
      savedHandler = handler;
      savedConcurrency = options?.concurrency;
      await startConsumer(handler, options?.concurrency);
    },

    on(event, listener) {
      if (!eventListeners.has(event)) eventListeners.set(event, new Set());
      eventListeners.get(event)!.add(listener);
      return () => { eventListeners.get(event)?.delete(listener); };
    },

    async close() {
      closed = true;
      if (consumerTag && channel) {
        await channel.cancel(consumerTag).catch(() => {});
      }
      await channel?.close().catch(() => {});
      await connection?.close().catch(() => {});
    },
  };

  return adapter;
}
