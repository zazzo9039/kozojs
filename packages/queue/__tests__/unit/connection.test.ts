import { describe, it, expect } from 'vitest';
import { resolveRedisConnection, resolveAmqpConnection } from '../../src/connection.js';

describe('resolveRedisConnection', () => {
  it('parses redis:// URL correctly', () => {
    const result = resolveRedisConnection('redis://localhost:6379/2');
    expect(result).toEqual({
      host: 'localhost',
      port: 6379,
      username: undefined,
      password: undefined,
      db: 2,
      tls: undefined,
    });
  });

  it('parses redis:// URL with password', () => {
    const result = resolveRedisConnection('redis://:secret@myhost:6380/1');
    expect(result).toEqual({
      host: 'myhost',
      port: 6380,
      username: undefined,
      password: 'secret',
      db: 1,
      tls: undefined,
    });
  });

  it('parses redis:// URL with username and password (Redis 6+ ACL)', () => {
    const result = resolveRedisConnection('redis://myuser:secret@myhost:6380/1');
    expect(result).toEqual({
      host: 'myhost',
      port: 6380,
      username: 'myuser',
      password: 'secret',
      db: 1,
      tls: undefined,
    });
  });

  it('parses rediss:// URL with TLS', () => {
    const result = resolveRedisConnection('rediss://secure-host:6379/0');
    expect(result).toMatchObject({
      host: 'secure-host',
      tls: {},
    });
  });

  it('defaults port to 6379 and db to 0', () => {
    const result = resolveRedisConnection('redis://localhost');
    expect(result.port).toBe(6379);
    expect(result.db).toBe(0);
  });

  it('passes through ioredis config object unchanged', () => {
    const config = { host: 'custom', port: 6380, password: 'pass' };
    expect(resolveRedisConnection(config)).toBe(config);
  });

  it('throws on non-redis URL string', () => {
    expect(() => resolveRedisConnection('http://localhost:6379')).toThrow('Invalid Redis URL');
  });

  it('throws on random string (no silent fallback)', () => {
    expect(() => resolveRedisConnection('just-a-hostname')).toThrow('Invalid Redis URL');
  });

  it('throws on malformed URL', () => {
    expect(() => resolveRedisConnection('redis://:')).toThrow();
  });
});

describe('resolveAmqpConnection', () => {
  it('accepts amqp:// URL string', () => {
    const result = resolveAmqpConnection('amqp://localhost');
    expect(result).toBe('amqp://localhost');
  });

  it('accepts amqps:// URL string', () => {
    const result = resolveAmqpConnection('amqps://secure-host:5672');
    expect(result).toBe('amqps://secure-host:5672');
  });

  it('passes through options object unchanged', () => {
    const config = { hostname: 'rabbitmq', port: 5672, username: 'guest' };
    expect(resolveAmqpConnection(config)).toBe(config);
  });

  it('throws on non-amqp URL string', () => {
    expect(() => resolveAmqpConnection('http://localhost')).toThrow('Invalid AMQP URL');
  });

  it('throws on random string', () => {
    expect(() => resolveAmqpConnection('rabbitmq-host')).toThrow('Invalid AMQP URL');
  });
});
