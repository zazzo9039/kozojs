// Password hashing with Node's built-in scrypt — no external dependency, no
// native build step. Each hash stores the parameters it was made with, so you
// can raise the cost below as hardware improves without invalidating the
// passwords already on disk.

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// scrypt cost parameters. N is the CPU/memory cost and must be a power of two;
// 2**15 is ~32 MB per hash (a good interactive-login default in 2026). Raise N
// (or r/p) over time — older hashes keep verifying because their own parameters
// are read back from the stored string.
const N = 32768;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const MAX_MEM = 64 * 1024 * 1024;

/** Hash a plaintext password. Returns `scrypt$N$r$p$salt$key` (salt+key base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAX_MEM })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/**
 * Verify a plaintext password against a stored `scrypt$…` hash. Constant-time:
 * the key is always derived in full and compared with timingSafeEqual, so the
 * time taken does not depend on how many leading characters match.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;

  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(keyB64, 'base64url');
  if (expected.length === 0) return false;

  // Derive with the STORED parameters, to the STORED key length, so the two
  // buffers handed to timingSafeEqual always have the same length.
  const key = (await scryptAsync(password, salt, expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEM,
  })) as Buffer;

  return key.length === expected.length && timingSafeEqual(key, expected);
}
