import type { Context, Next } from 'hono';
import type { GuardRequest, KozoGuard } from '../guard.js';
import {
  honoConnectionAddress,
  resolveClientIp,
  type TrustProxy,
  type ClientAddressSource,
} from '../client-ip.js';

// ── Store interface ──────────────────────────────────────────────────────────

export interface RateLimitStoreRecord {
  count: number;
  resetAt: number;
}

/** Pluggable store for rate-limit state (e.g. @kozojs/redis rateLimit store). */
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitStoreRecord>;
  reset(key: string): Promise<void>;
}

// ── Shared key derivation ────────────────────────────────────────────────────
//
// One implementation, used by both `rateLimit` (Hono middleware) and
// `rateLimitGuard` (native guard), so the same client produces the same key on
// both transports. The default keys on the connection address; `x-forwarded-for`
// is consulted only under an explicit `trustProxy` (see client-ip.ts).

/** Adapt a Hono context to the transport-agnostic client-address source. */
function honoSource(c: Context): ClientAddressSource {
  return {
    connectionAddress: honoConnectionAddress(c),
    header: (name) => c.req.header(name),
  };
}

/** Adapt a native GuardRequest to the transport-agnostic client-address source. */
function guardSource(req: GuardRequest): ClientAddressSource {
  return {
    connectionAddress: req.remoteAddress ?? '',
    header: (name) => req.header(name),
  };
}

// ── In-memory store (default) ────────────────────────────────────────────────

/**
 * Hard cap on distinct keys held in memory. Without it, an attacker rotating a
 * spoofed identity inserts one live record per request and the 60s sweep never
 * catches up — an unbounded memory-growth DoS. At ~200 bytes per entry (an IP
 * string key plus a two-number record) this caps the store near ~20 MB.
 * Eviction is FIFO by insertion order: a legitimate heavy client that is
 * evicted simply has its (already small) counter reset.
 */
const MAX_MEMORY_KEYS = 100_000;

/** Live cap; overridable in tests via {@link _setMaxMemoryKeysForTest}. */
let maxMemoryKeys = MAX_MEMORY_KEYS;

const memoryMap = new Map<string, RateLimitStoreRecord>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let nextLimiterId = 1;

function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryMap) {
      if (now > v.resetAt) memoryMap.delete(k);
    }
    if (memoryMap.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 60_000);
  cleanupTimer.unref();
}

/** Drop oldest-inserted keys until the global store is back within the cap. */
function evictIfNeeded(): void {
  if (memoryMap.size <= maxMemoryKeys) return;
  let overflow = memoryMap.size - maxMemoryKeys;
  for (const oldest of memoryMap.keys()) {
    memoryMap.delete(oldest);
    if (--overflow <= 0) break;
  }
}

const sharedMemoryStore: RateLimitStore = {
  async increment(key, windowMs) {
    const now = Date.now();
    let record = memoryMap.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
    }
    record.count++;
    memoryMap.set(key, record);
    evictIfNeeded();
    ensureCleanup();
    return record;
  },
  async reset(key) {
    memoryMap.delete(key);
  },
};

/**
 * Namespace one limiter inside the globally bounded in-memory store.
 *
 * The namespace prevents unrelated policies from sharing counters, while the
 * single backing map preserves the process-wide memory cap from F-09.
 */
function createMemoryStore(): RateLimitStore {
  const prefix = `limiter:${nextLimiterId++}:`;
  return {
    increment: (key, windowMs) => sharedMemoryStore.increment(prefix + key, windowMs),
    reset: (key) => sharedMemoryStore.reset(prefix + key),
  };
}

/** Seconds until the window resets, floored at 0 — the `Retry-After` value. */
function retryAfterSeconds(record: RateLimitStoreRecord): number {
  return Math.max(0, Math.ceil((record.resetAt - Date.now()) / 1000));
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  max: number;
  window: number; // in seconds
  /**
   * Override the identity used to bucket requests. When omitted, the client is
   * derived from the connection address, honoring `x-forwarded-for` only under
   * `trustProxy`.
   */
  keyGenerator?: (c: Context) => string;
  /**
   * Proxy trust for the default key derivation. `false` (default) ignores
   * forwarding headers entirely. `true` trusts one proxy; a number trusts that
   * many. Ignored when a custom `keyGenerator` is supplied. Designed to be
   * inherited from an app-level `trustProxy` (S2) without renaming.
   */
  trustProxy?: TrustProxy;
  message?: string;
  /** External store (Redis, etc.). Falls back to in-memory Map when omitted. */
  store?: RateLimitStore;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Rate limiting middleware.
 * Pass `store` for distributed rate limiting (e.g. @kozojs/redis).
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    max = 100,
    window = 60,
    trustProxy = false,
    keyGenerator = (c: Context) => resolveClientIp(honoSource(c), trustProxy),
    message = 'Too many requests',
    store = createMemoryStore(),
  } = options;

  const windowMs = window * 1000;

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const record = await store.increment(key, windowMs);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - record.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > max) {
      c.header('Retry-After', String(retryAfterSeconds(record)));
      return c.json({ error: message }, 429);
    }

    await next();
  };
}

// ── Guard variant (transport-agnostic — native speed under uWS) ─────────────

export interface RateLimitGuardOptions {
  max: number;
  window: number; // in seconds
  /** See {@link RateLimitOptions.keyGenerator}. */
  keyGenerator?: (req: GuardRequest) => string;
  /** See {@link RateLimitOptions.trustProxy}. */
  trustProxy?: TrustProxy;
  message?: string;
  /** External store (Redis, etc.). Falls back to in-memory Map when omitted. */
  store?: RateLimitStore;
}

/**
 * Rate limiting as a guard for `app.guard()` — same semantics, same store and
 * the same key derivation as the `rateLimit` middleware (so a client is bucketed
 * identically on both transports), but it runs on the uWS native fast path
 * instead of forcing the Hono bridge.
 *
 * @example
 * app.guard('/api/auth/login', rateLimitGuard({ max: 20, window: 900 }));
 */
export function rateLimitGuard(options: RateLimitGuardOptions): KozoGuard {
  const {
    max,
    window,
    trustProxy = false,
    keyGenerator = (req: GuardRequest) => resolveClientIp(guardSource(req), trustProxy),
    message = 'Too many requests',
    store = createMemoryStore(),
  } = options;

  const windowMs = window * 1000;

  return async (req) => {
    const record = await store.increment(keyGenerator(req), windowMs);
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(max),
      'X-RateLimit-Remaining': String(Math.max(0, max - record.count)),
      'X-RateLimit-Reset': String(Math.ceil(record.resetAt / 1000)),
    };
    if (record.count > max) {
      headers['Retry-After'] = String(retryAfterSeconds(record));
      return { deny: { status: 429, body: { error: message }, headers } };
    }
    return { headers };
  };
}

/**
 * Clear in-memory rate limit store (for testing)
 */
export function clearRateLimitStore() {
  memoryMap.clear();
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
}

// ── Test seams (not part of the public API) ─────────────────────────────────

/** @internal Current number of keys held in the in-memory store. */
export function _memoryStoreSize(): number {
  return memoryMap.size;
}

/** @internal Override the in-memory key cap; returns the previous value. */
export function _setMaxMemoryKeysForTest(n: number): number {
  const prev = maxMemoryKeys;
  maxMemoryKeys = n;
  return prev;
}
