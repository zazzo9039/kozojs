import { Plugin } from '@kozojs/core';

/** A job as seen by the consumer/processor callback. */
interface KozoJob<TData = unknown> {
    id: string;
    name: string;
    data: TData;
    attemptsMade: number;
    /** Backend-specific raw job object (BullMQ Job, amqplib Message, etc.) */
    raw: unknown;
}
/** Options when adding a single job. */
interface AddJobOptions {
    /** Delay before the job becomes visible (ms). Redis only. */
    delay?: number;
    /** Number of retry attempts. Default: 3 */
    attempts?: number;
    /** Priority (lower = higher priority). Redis only; AMQP ignores this. */
    priority?: number;
    /** Unique job ID (deduplication). */
    jobId?: string;
}
/** Events emitted by adapters. */
interface QueueAdapterEvents<TData = unknown> {
    completed: (job: KozoJob<TData>) => void;
    failed: (job: KozoJob<TData>, error: Error) => void;
    error: (error: Error) => void;
}
/**
 * Unified queue adapter interface.
 * Both Redis (BullMQ) and AMQP (amqplib) implement this.
 */
interface QueueAdapter<TData = unknown> {
    readonly name: 'redis' | 'amqp';
    readonly queueName: string;
    /** Enqueue a job. Returns a job ID. */
    add(jobName: string, data: TData, options?: AddJobOptions): Promise<string>;
    /** Start processing jobs. Only one processor per adapter instance. */
    process(handler: (job: KozoJob<TData>) => Promise<unknown>, options?: {
        concurrency?: number;
    }): Promise<void>;
    /** Subscribe to lifecycle events. Returns an unsubscribe function. */
    on<E extends keyof QueueAdapterEvents<TData>>(event: E, listener: QueueAdapterEvents<TData>[E]): () => void;
    /** Gracefully close all connections. */
    close(): Promise<void>;
    /** Pause processing (if supported). */
    pause?(): Promise<void>;
    /** Resume processing (if supported). */
    resume?(): Promise<void>;
}
/** Redis connection: ioredis-compatible options object or redis:// URL string. */
type RedisConnection = Record<string, unknown> | string;
interface RedisAdapterConfig {
    adapter: 'redis';
    connection: RedisConnection;
    /** Default job options applied to every job (BullMQ JobsOptions) */
    defaultJobOptions?: Record<string, unknown>;
    /** Override raw BullMQ QueueOptions */
    bullmq?: Record<string, unknown>;
}
interface AmqpConnectOptions {
    hostname?: string;
    port?: number;
    username?: string;
    password?: string;
    vhost?: string;
    protocol?: string;
    [key: string]: unknown;
}
interface AmqpAdapterConfig {
    adapter: 'amqp';
    /** amqp:// URL or connect options object */
    connection: string | AmqpConnectOptions;
    /** Exchange name. Default: '' (direct to queue) */
    exchange?: string;
    /** Exchange type. Default: 'direct' */
    exchangeType?: 'direct' | 'topic' | 'fanout' | 'headers';
    /** Queue is durable (survives broker restart). Default: true */
    durable?: boolean;
    /** Prefetch count (concurrency). Default: 1 */
    prefetch?: number;
    /** Retry backoff base delay in ms. Default: 1000 */
    retryBackoffMs?: number;
}
type AdapterConfig = RedisAdapterConfig | AmqpAdapterConfig;
interface QueuePluginOptions {
    /** Adapter instances to close on shutdown */
    adapters?: QueueAdapter[];
    /** Milliseconds to wait before force-closing. Default: 5000 */
    closeTimeout?: number;
}

declare function createRedisAdapter<TData = unknown>(queueName: string, config: Omit<RedisAdapterConfig, 'adapter'>): QueueAdapter<TData>;

declare function createAmqpAdapter<TData = unknown>(queueName: string, config: Omit<AmqpAdapterConfig, 'adapter'>): QueueAdapter<TData>;

/**
 * Kozo Plugin that wires queue adapters into graceful shutdown.
 *
 * Uses Kozo's ShutdownManager to register a cleanup hook that:
 * 1. Closes all registered adapters (drains in-flight jobs)
 * 2. Force-closes after closeTimeout ms to prevent hangs
 */
declare function queuePlugin(options?: QueuePluginOptions): Plugin;

/**
 * Parse a Redis connection string or pass through an ioredis config.
 * THROWS on invalid URLs instead of silently falling back.
 */
declare function resolveRedisConnection(conn: string | Record<string, unknown>): Record<string, unknown>;
/**
 * Validate and normalize an AMQP connection.
 * Accepts an amqp:// URL string or an options object.
 */
declare function resolveAmqpConnection(conn: string | AmqpConnectOptions): string | AmqpConnectOptions;

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
declare function createQueue<TData = unknown>(name: string, config: AdapterConfig): QueueAdapter<TData>;

export { type AdapterConfig, type AddJobOptions, type AmqpAdapterConfig, type AmqpConnectOptions, type KozoJob, type QueueAdapter, type QueueAdapterEvents, type QueuePluginOptions, type RedisAdapterConfig, type RedisConnection, createAmqpAdapter, createQueue, createRedisAdapter, queuePlugin, resolveAmqpConnection, resolveRedisConnection };
