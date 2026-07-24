// H6 / F-19 — the starter template hashes passwords instead of storing them
// in plaintext. These tests cover the scrypt hash/verify utility the template
// ships (src/lib/password.ts). Runs as part of this example's `vitest run`.

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing (scrypt)', () => {
  it('produces the scrypt$N$r$p$salt$key format and never the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(hash).not.toContain('correct horse battery staple');
    expect(hash.split('$')).toHaveLength(6);
  });

  it('salts each hash, so the same password hashes differently every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('verifies the correct password', async () => {
    const hash = await hashPassword('s3cret-pw');
    expect(await verifyPassword('s3cret-pw', hash)).toBe(true);
  });

  it('rejects a wrong password, including one sharing a long prefix', async () => {
    const hash = await hashPassword('s3cret-password-value');
    expect(await verifyPassword('s3cret-password-valuX', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
    // Verification derives the full key and compares with timingSafeEqual, so
    // the time taken does not depend on how many leading characters match.
  });

  it('rejects a malformed or non-scrypt stored value without throwing', async () => {
    for (const bad of ['', 'plaintext', 'scrypt$only', 'bcrypt$1$2$3$4$5']) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });
});
