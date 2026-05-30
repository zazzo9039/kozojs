import type { AdapterConfig, QueueAdapter, RedisAdapterConfig, AmqpAdapterConfig } from './types.js';
import { createRedisAdapter } from './adapters/redis.js';
import { createAmqpAdapter } from './adapters/amqp.js';

// ─────────────────────────────────────────────────────────────────────────────
// Unified factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a queue adapter from a config object.
 * Dispatches to the correct backend based on `config.adapter`.
 *
 * ```ts
 * // Redis (BullMQ)
 * const queue = createQueue<EmailJob>('emails', {
 *   adapter: 'redis',
 *   connection: process.env.REDIS_URL ?? 'redis://localhost:6379',
 * });
 *
 * // AMQP (RabbitMQ)
 * const queue = createQueue<TaskJob>('tasks', {
 *   adapter: 'amqp',
 *   connection: process.env.AMQP_URL ?? 'amqp://localhost',
 * });
 *
 * await queue.add('welcome', { to: 'user@example.com', subject: 'Hi!' });
 * ```
 */
export function createQueue<TData = unknown>(
  name: string,
  config: AdapterConfig,
): QueueAdapter<TData> {
  switch (config.adapter) {
    case 'redis': {
      const { adapter: _, ...rest } = config as RedisAdapterConfig;
      return createRedisAdapter<TData>(name, rest);
    }
    case 'amqp': {
      const { adapter: _, ...rest } = config as AmqpAdapterConfig;
      return createAmqpAdapter<TData>(name, rest);
    }
    default:
      throw new Error(`[kozo:queue] Unknown adapter: "${(config as any).adapter}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export { createRedisAdapter } from './adapters/redis.js';
export { createAmqpAdapter } from './adapters/amqp.js';
export { queuePlugin } from './plugin.js';
export { resolveRedisConnection, resolveAmqpConnection } from './connection.js';

export type {
  QueueAdapter,
  KozoJob,
  AddJobOptions,
  QueueAdapterEvents,
  QueuePluginOptions,
  AdapterConfig,
  RedisAdapterConfig,
  AmqpAdapterConfig,
  RedisConnection,
  AmqpConnectOptions,
} from './types.js';
