// ============================================================================
// Tests for helpers.ts — defineEnv, paginate, uuid, schemas
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  defineEnv,
  paginate,
  uuid,
  paginationSchema,
  uuidParams,
  idParams,
  timestamps,
  sortSchema,
  searchSchema,
  successSchema,
  deletedSchema,
} from '../src/helpers.js';

// ── defineEnv ────────────────────────────────────────────────────────────

describe('defineEnv', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    // Restore
    for (const k of Object.keys(process.env)) {
      if (!(k in origEnv)) delete process.env[k];
    }
    Object.assign(process.env, origEnv);
  });

  it('parses valid environment variables', () => {
    process.env.TEST_PORT = '3000';
    process.env.TEST_HOST = 'localhost';
    const env = defineEnv({
      TEST_PORT: z.coerce.number(),
      TEST_HOST: z.string(),
    });
    expect(env.TEST_PORT).toBe(3000);
    expect(env.TEST_HOST).toBe('localhost');
  });

  it('applies defaults', () => {
    const env = defineEnv({
      MY_VAR: z.string().default('fallback'),
    });
    expect(env.MY_VAR).toBe('fallback');
  });

  it('throws on missing required variables', () => {
    expect(() => defineEnv({
      REQUIRED_VAR: z.string(),
    })).toThrow('[Kozo] Invalid environment variables');
  });

  it('throws on invalid values', () => {
    process.env.BAD_PORT = 'not-a-number';
    expect(() => defineEnv({
      BAD_PORT: z.coerce.number().int().positive(),
    })).toThrow('[Kozo] Invalid environment variables');
  });
});

// ── paginate ─────────────────────────────────────────────────────────────

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

  it('returns correct page', () => {
    const result = paginate(items, 1, 10);
    expect(result.data).toHaveLength(10);
    expect(result.data[0].id).toBe(1);
    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });

  it('returns last page correctly', () => {
    const result = paginate(items, 3, 10);
    expect(result.data).toHaveLength(5);
    expect(result.data[0].id).toBe(21);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
  });

  it('returns empty data for out-of-range page', () => {
    const result = paginate(items, 10, 10);
    expect(result.data).toEqual([]);
    expect(result.hasNext).toBe(false);
  });

  it('handles empty array', () => {
    const result = paginate([], 1, 10);
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});

// ── uuid ─────────────────────────────────────────────────────────────────

describe('uuid', () => {
  it('returns a valid UUID v4', () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    expect(ids.size).toBe(100);
  });
});

// ── Zod schemas ──────────────────────────────────────────────────────────

describe('paginationSchema', () => {
  it('parses valid pagination', () => {
    const result = paginationSchema.parse({ page: '2', limit: '20' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(20);
  });

  it('applies defaults', () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('rejects page < 1', () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
  });

  it('rejects limit > 100', () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });
});

describe('uuidParams', () => {
  it('accepts valid UUID', () => {
    const result = uuidParams.parse({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    expect(result.id).toBeDefined();
  });

  it('rejects invalid UUID', () => {
    expect(() => uuidParams.parse({ id: 'not-a-uuid' })).toThrow();
  });
});

describe('idParams', () => {
  it('coerces string to positive integer', () => {
    const result = idParams.parse({ id: '42' });
    expect(result.id).toBe(42);
  });

  it('rejects negative and zero', () => {
    expect(() => idParams.parse({ id: '0' })).toThrow();
    expect(() => idParams.parse({ id: '-1' })).toThrow();
  });
});

describe('timestamps', () => {
  it('parses Date objects', () => {
    const result = timestamps.parse({ createdAt: new Date(), updatedAt: new Date() });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });
});

describe('sortSchema', () => {
  it('parses sort params with defaults', () => {
    const result = sortSchema.parse({});
    expect(result.sortOrder).toBe('asc');
    expect(result.sortBy).toBeUndefined();
  });

  it('accepts desc order', () => {
    const result = sortSchema.parse({ sortBy: 'name', sortOrder: 'desc' });
    expect(result.sortBy).toBe('name');
    expect(result.sortOrder).toBe('desc');
  });
});

describe('searchSchema', () => {
  it('parses search query', () => {
    const result = searchSchema.parse({ q: 'hello' });
    expect(result.q).toBe('hello');
  });

  it('q is optional', () => {
    const result = searchSchema.parse({});
    expect(result.q).toBeUndefined();
  });
});

describe('successSchema', () => {
  it('parses success response', () => {
    const result = successSchema.parse({ success: true, message: 'done' });
    expect(result.success).toBe(true);
  });
});

describe('deletedSchema', () => {
  it('parses deleted response', () => {
    const result = deletedSchema.parse({ success: true, deletedId: 'abc123' });
    expect(result.deletedId).toBe('abc123');
  });
});
