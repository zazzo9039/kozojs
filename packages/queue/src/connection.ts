import type { AmqpConnectOptions } from './types.js';

/** Parsed Redis connection options (ioredis-compatible). */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls?: Record<string, unknown>;
}

/**
 * Parse a Redis connection string or pass through an ioredis config.
 * THROWS on invalid URLs instead of silently falling back.
 */
export function resolveRedisConnection(conn: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof conn !== 'string') return conn;

  if (!conn.startsWith('redis://') && !conn.startsWith('rediss://')) {
    throw new Error(
      `[kozo:queue] Invalid Redis URL: "${conn}". ` +
      `Expected a redis:// or rediss:// URL, or an ioredis options object.`,
    );
  }

  const url = new URL(conn);
  const result: RedisConnectionOptions = {
    host: url.hostname || 'localhost',
    port: url.port ? parseInt(url.port, 10) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
  return result as unknown as Record<string, unknown>;
}

/**
 * Validate and normalize an AMQP connection.
 * Accepts an amqp:// URL string or an options object.
 */
export function resolveAmqpConnection(conn: string | AmqpConnectOptions): string | AmqpConnectOptions {
  if (typeof conn !== 'string') return conn;

  if (!conn.startsWith('amqp://') && !conn.startsWith('amqps://')) {
    throw new Error(
      `[kozo:queue] Invalid AMQP URL: "${conn}". ` +
      `Expected an amqp:// or amqps:// URL, or an options object.`,
    );
  }

  // Validate it parses
  new URL(conn);
  return conn;
}
