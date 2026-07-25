/**
 * H1 / F-01 — a known-weak or too-short JWT secret must be refused when the
 * middleware/guard is CONSTRUCTED, so the application fails to boot rather than
 * serving requests signed with a secret the whole internet has.
 *
 * No secret is committed here: every usable secret is generated at runtime
 * (00-INDEX guardrail 7). The only literals present are the ones being refused,
 * and they are read from `@kozojs/core`, not retyped.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { KNOWN_WEAK_SECRETS } from '@kozojs/core';
import { authenticateJWT, createJWT, jwtGuard } from '../src/index.js';

/** 48 random bytes → 64 base64url chars. Comfortably over the 32-byte floor. */
const strongSecret = () => randomBytes(48).toString('base64url');
/** 12 random bytes → 16 base64url chars. Under the floor, but not a known literal. */
const shortSecret = () => randomBytes(12).toString('base64url');

const weakLiterals = [...KNOWN_WEAK_SECRETS];

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  vi.restoreAllMocks();
});

describe('known-weak secrets are refused at construction time', () => {
  it('has a non-empty known-weak set to test against', () => {
    expect(weakLiterals.length).toBeGreaterThan(0);
    expect(weakLiterals).toContain('dev-secret-must-be-at-least-32-characters-long');
    expect(weakLiterals).toContain('change-me-to-a-random-secret-at-least-32-chars');
    expect(weakLiterals).toContain('change-me-to-a-random-secret');
    expect(weakLiterals).toContain('change-me-in-production');
  });

  it.each(weakLiterals)('jwtGuard(%j) throws', (literal) => {
    expect(() => jwtGuard(literal)).toThrow(/^\[Kozo\]/);
  });

  it.each(weakLiterals)('authenticateJWT(%j) throws', (literal) => {
    expect(() => authenticateJWT(literal)).toThrow(/^\[Kozo\]/);
  });

  it('the error tells the operator how to generate a good secret', () => {
    expect(() => jwtGuard('change-me-in-production')).toThrow(/randomBytes/);
  });

  it('refuses regardless of NODE_ENV', () => {
    for (const env of ['production', 'development', 'test']) {
      process.env.NODE_ENV = env;
      expect(() => jwtGuard('change-me')).toThrow(/^\[Kozo\]/);
      expect(() => authenticateJWT('change-me')).toThrow(/^\[Kozo\]/);
    }
  });

  it('accepts a freshly generated secret', () => {
    const secret = strongSecret();
    expect(() => jwtGuard(secret)).not.toThrow();
    expect(() => authenticateJWT(secret)).not.toThrow();
  });
});

describe('short secrets', () => {
  it('throw under NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    const secret = shortSecret();
    expect(() => jwtGuard(secret)).toThrow(/at least 32/);
    expect(() => authenticateJWT(secret)).toThrow(/at least 32/);
  });

  it('warn, but do not throw, outside production', () => {
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secret = shortSecret();

    expect(() => jwtGuard(secret)).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/^\[Kozo\] Warning:/);
  });

  it('warn once per secret, not once per construction', () => {
    process.env.NODE_ENV = 'development';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secret = shortSecret();

    jwtGuard(secret);
    jwtGuard(secret);
    authenticateJWT(secret);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('an empty secret throws even in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() => jwtGuard('')).toThrow(/^\[Kozo\]/);
  });
});

describe('non-string HMAC key material', () => {
  it('refuses a Uint8Array that spells a known-weak literal', () => {
    const bytes = new TextEncoder().encode('change-me-in-production');
    expect(() => jwtGuard(bytes)).toThrow(/ships publicly with Kozo/);
    expect(() => authenticateJWT(bytes)).toThrow(/ships publicly with Kozo/);
  });

  it('refuses a short Uint8Array under NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => jwtGuard(randomBytes(8))).toThrow(/at least 32/);
    expect(() => authenticateJWT(randomBytes(8))).toThrow(/at least 32/);
  });

  it('accepts sufficiently long random byte key material', () => {
    process.env.NODE_ENV = 'production';
    const bytes = randomBytes(48);
    expect(() => jwtGuard(bytes)).not.toThrow();
    expect(() => authenticateJWT(bytes)).not.toThrow();
  });

  it('skips the check entirely when an asymmetric getKey resolver is supplied', () => {
    process.env.NODE_ENV = 'production';
    const getKey = (async () => {
      throw new Error('never called');
    }) as never;
    expect(() => jwtGuard('change-me', { getKey })).not.toThrow();
    expect(() => authenticateJWT('change-me', { getKey })).not.toThrow();
  });
});

describe('createJWT signing secret policy', () => {
  it('refuses a known-weak signing secret in every environment', async () => {
    for (const env of ['production', 'development', 'test']) {
      process.env.NODE_ENV = env;
      await expect(createJWT({ sub: 'u1' }, 'change-me')).rejects.toThrow(
        /ships publicly with Kozo/,
      );
    }
  });

  it('refuses a short signing secret in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(createJWT({ sub: 'u1' }, shortSecret())).rejects.toThrow(/at least 32/);
  });

  it('accepts a freshly generated signing secret', async () => {
    process.env.NODE_ENV = 'production';
    await expect(createJWT({ sub: 'u1' }, strongSecret())).resolves.toMatch(
      /^[^.]+\.[^.]+\.[^.]+$/,
    );
  });
});

describe('an unset environment variable', () => {
  it('is refused rather than turned into the nine-byte key "undefined"', () => {
    // What `jwtGuard(process.env.JWT_SECRET!)` actually evaluates to when the
    // variable is not set. The `!` is a compile-time claim only.
    const unset = process.env.KOZO_DEFINITELY_UNSET_SECRET as unknown as string;
    expect(unset).toBeUndefined();
    expect(() => jwtGuard(unset)).toThrow(/received no secret/);
    expect(() => authenticateJWT(unset)).toThrow(/received no secret/);
  });

  it('points at requireSecret in the message', () => {
    expect(() => jwtGuard(undefined as unknown as string)).toThrow(/requireSecret/);
  });
});

describe('the check runs at construction, not per request', () => {
  it('jwtGuard throws before any request is made', () => {
    let guard: unknown;
    expect(() => {
      guard = jwtGuard('change-me-to-a-random-secret');
    }).toThrow();
    expect(guard).toBeUndefined();
  });

  it('authenticateJWT throws before any request is made', () => {
    let mw: unknown;
    expect(() => {
      mw = authenticateJWT('change-me-to-a-random-secret');
    }).toThrow();
    expect(mw).toBeUndefined();
  });
});
