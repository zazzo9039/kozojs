// ============================================================================
// Core adapter interface (framework-agnostic, no BullMQ/amqplib imports)
// ============================================================================

/** A job as seen by the consumer/processor callback. */
export interface KozoJob<TData = unknown> {
  id: string;
  name: string;
  data: TData;
  attemptsMade: number;
  /** Backend-specific raw job object (BullMQ Job, amqplib Message, etc.) */
  raw: unknown;
}

/** Options when adding a single job. */
export interface AddJobOptions {
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
export interface QueueAdapterEvents<TData = unknown> {
  completed: (job: KozoJob<TData>) => void;
  failed: (job: KozoJob<TData>, error: Error) => void;
  error: (error: Error) => void;
}

/**
 * Unified queue adapter interface.
 * Both Redis (BullMQ) and AMQP (amqplib) implement this.
 */
export interface QueueAdapter<TData = unknown> {
  readonly name: 'redis' | 'amqp';
  readonly queueName: string;

  /** Enqueue a job. Returns a job ID. */
  add(jobName: string, data: TData, options?: AddJobOptions): Promise<string>;

  /** Start processing jobs. Only one processor per adapter instance. */
  process(
    handler: (job: KozoJob<TData>) => Promise<unknown>,
    options?: { concurrency?: number },
  ): Promise<void>;

  /** Subscribe to lifecycle events. Returns an unsubscribe function. */
  on<E extends keyof QueueAdapterEvents<TData>>(
    event: E,
    listener: QueueAdapterEvents<TData>[E],
  ): () => void;

  /** Gracefully close all connections. */
  close(): Promise<void>;

  /** Pause processing (if supported). */
  pause?(): Promise<void>;

  /** Resume processing (if supported). */
  resume?(): Promise<void>;
}

// ============================================================================
// Redis adapter config (BullMQ-specific types are import()-time only)
// ============================================================================

/** Redis connection: ioredis-compatible options object or redis:// URL string. */
export type RedisConnection = Record<string, unknown> | string;

export interface RedisAdapterConfig {
  adapter: 'redis';
  connection: RedisConnection;
  /** Default job options applied to every job (BullMQ JobsOptions) */
  defaultJobOptions?: Record<string, unknown>;
  /** Override raw BullMQ QueueOptions */
  bullmq?: Record<string, unknown>;
}

// ============================================================================
// AMQP adapter config
// ============================================================================

export interface AmqpConnectOptions {
  hostname?: string;
  port?: number;
  username?: string;
  password?: string;
  vhost?: string;
  protocol?: string;
  [key: string]: unknown;
}

export interface AmqpAdapterConfig {
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

export type AdapterConfig = RedisAdapterConfig | AmqpAdapterConfig;

// ============================================================================
// Plugin types
// ============================================================================

export interface QueuePluginOptions {
  /** Adapter instances to close on shutdown */
  adapters?: QueueAdapter[];
  /** Milliseconds to wait before force-closing. Default: 5000 */
  closeTimeout?: number;
}
