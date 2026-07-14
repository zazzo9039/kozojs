import type { Context, Next } from 'hono';
import type { GuardRequest, KozoGuard } from '../guard.js';

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

// ── Options ──────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  max: number;
  window: number; // in seconds
  keyGenerator?: (c: Context) => string;
  message?: string;
  /** External store (Redis, etc.). Falls back to in-memory Map when omitted. */
  store?: RateLimitStore;
}

// ── In-memory store (default) ────────────────────────────────────────────────

const memoryMap = new Map<string, RateLimitStoreRecord>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

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

const memoryStore: RateLimitStore = {
  async increment(key, windowMs) {
    const now = Date.now();
    let record = memoryMap.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
    }
    record.count++;
    memoryMap.set(key, record);
    ensureCleanup();
    return record;
  },
  async reset(key) {
    memoryMap.delete(key);
  },
};

/**
 * Rate limiting middleware.
 * Pass `store` for distributed rate limiting (e.g. @kozojs/redis).
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    max = 100,
    window = 60,
    keyGenerator = (c: Context) =>
      c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'anonymous',
    message = 'Too many requests',
    store = memoryStore,
  } = options;

  const windowMs = window * 1000;

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const record = await store.increment(key, windowMs);

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - record.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > max) {
      return c.json({ error: message }, 429);
    }

    await next();
  };
}

// ── Guard variant (transport-agnostic — native speed under uWS) ─────────────

export interface RateLimitGuardOptions {
  max: number;
  window: number; // in seconds
  keyGenerator?: (req: GuardRequest) => string;
  message?: string;
  /** External store (Redis, etc.). Falls back to in-memory Map when omitted. */
  store?: RateLimitStore;
}

/**
 * Rate limiting as a guard for `app.guard()` — same semantics and store as
 * the `rateLimit` middleware (X-RateLimit-* headers, 429 on excess), but it
 * runs on the uWS native fast path instead of forcing the Hono bridge.
 *
 * @example
 * app.guard('/api/auth/login', rateLimitGuard({ max: 20, window: 900 }));
 */
export function rateLimitGuard(options: RateLimitGuardOptions): KozoGuard {
  const {
    max,
    window,
    keyGenerator = (req: GuardRequest) =>
      req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.header('x-real-ip')
      ?? req.remoteAddress
      ?? 'anonymous',
    message = 'Too many requests',
    store = memoryStore,
  } = options;

  const windowMs = window * 1000;

  return async (req) => {
    const record = await store.increment(keyGenerator(req), windowMs);
    const headers = {
      'X-RateLimit-Limit': String(max),
      'X-RateLimit-Remaining': String(Math.max(0, max - record.count)),
      'X-RateLimit-Reset': String(Math.ceil(record.resetAt / 1000)),
    };
    if (record.count > max) {
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
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}
