// ============================================================================
// Tests for helpers.ts — defineEnv, paginate, uuid, schemas
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { KNOWN_WEAK_SECRETS } from '../src/weak-secrets.js';
import {
  defineEnv,
  requireSecret,
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

// ── requireSecret ────────────────────────────────────────────────────────

describe('requireSecret', () => {
  const VAR = 'TEST_REQUIRE_SECRET';
  const originalNodeEnv = process.env.NODE_ENV;

  /** Generated per call — never a committed fixture. */
  const strong = () => randomBytes(48).toString('base64url');

  afterEach(() => {
    delete process.env[VAR];
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('returns the value when it is long enough', () => {
    const secret = strong();
    process.env[VAR] = secret;
    expect(requireSecret(VAR)).toBe(secret);
  });

  it('throws when the variable is not set, naming it', () => {
    expect(() => requireSecret(VAR)).toThrow(/^\[Kozo\] Missing required environment variable: TEST_REQUIRE_SECRET/);
  });

  it('throws when the variable is empty', () => {
    process.env[VAR] = '';
    expect(() => requireSecret(VAR)).toThrow(/is empty/);
  });

  it('throws when the value is shorter than 32 bytes', () => {
    process.env[VAR] = randomBytes(8).toString('hex'); // 16 chars
    expect(() => requireSecret(VAR)).toThrow(/at least 32 are required/);
  });

  it('is strict outside production too — unlike the auth guards, it never just warns', () => {
    process.env.NODE_ENV = 'development';
    process.env[VAR] = randomBytes(8).toString('hex');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => requireSecret(VAR)).toThrow(/at least 32 are required/);
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws on a secret Kozo has published, however long it is', () => {
    // Read from the blocklist rather than retyped: the repository-wide scan in
    // packages/cli/__tests__/no-weak-secrets.test.ts allows these literals in
    // exactly one file, and this is not it.
    const longest = [...KNOWN_WEAK_SECRETS].sort((a, b) => b.length - a.length)[0]!;
    expect(longest.length).toBeGreaterThanOrEqual(32); // long enough to pass the length check
    process.env[VAR] = longest;
    expect(() => requireSecret(VAR)).toThrow(/ships publicly with Kozo/);
  });

  it('tells the operator how to generate a replacement', () => {
    expect(() => requireSecret(VAR)).toThrow(/randomBytes\(48\)/);
  });

  it('honours a custom minimum', () => {
    process.env[VAR] = randomBytes(32).toString('base64url'); // 43 chars
    expect(() => requireSecret(VAR, { minBytes: 64 })).toThrow(/at least 64 are required/);
    expect(requireSecret(VAR, { minBytes: 16 })).toBe(process.env[VAR]);
  });

  it('counts bytes, not UTF-16 code units', () => {
    // 16 characters, 48 bytes in UTF-8 — long enough despite a .length of 16.
    process.env[VAR] = '🔥'.repeat(8);
    expect(process.env[VAR]!.length).toBeLessThan(32);
    expect(() => requireSecret(VAR)).not.toThrow();
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
