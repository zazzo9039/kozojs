// ============================================================================
// Kozo Guards — transport-agnostic security checks (auth, rate-limit, …)
// ============================================================================
//
// A guard is ONE function that runs before the route handler on BOTH
// transports:
//
//   listen()       → wrapped as a Hono middleware   (guardToHonoMiddleware)
//   nativeListen() → compiled into the uWS fast path (wrapNativeWithGuards)
//
// Unlike `app.middleware()` (Hono-only — covered routes must be served through
// the Hono bridge under uWS, losing the zero-shim path), `app.guard()` keeps
// the native path: the guard reads pre-collected headers and writes denials
// directly via cork(). Same security, native speed.
//
//   app.guard('/api/*', async (req) => {
//     const token = req.header('authorization');
//     if (!token) return { deny: { status: 401 } };
//     const user = await verify(token);
//     return user ? { user } : { deny: { status: 401 } };
//   });
// ============================================================================

import type { Context, MiddlewareHandler } from 'hono';
import type { KozoEnv } from './types.js';
import type { UwsNativeHandler } from './uws-transport.js';
import {
  uwsCorkRespond,
  uwsSafeEnd,
  uwsFastWriteError,
} from './uws-transport.js';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal transport-agnostic request view passed to guards.
 * Built from pre-collected data on the uWS path (zero extra I/O) and from the
 * Hono context under `listen()`.
 */
export interface GuardRequest {
  /** Uppercase HTTP method, e.g. 'GET'. */
  method: string;
  /** Pathname without query string, e.g. '/api/users'. */
  path: string;
  /** Path including query string, e.g. '/api/users?page=1'. */
  url: string;
  /**
   * Client IP when available. On the uWS native path this is captured
   * synchronously from `getRemoteAddressAsText()`; under Hono it comes from the
   * socket or proxy headers.
   */
  remoteAddress: string;
  /**
   * Path parameters. Populated on the native path; best-effort under Hono
   * middleware (pattern params only). Prefer `path` parsing for routing logic.
   */
  params: Record<string, string>;
  /** User attached by an earlier guard in the chain (or null). */
  readonly user: unknown;
  /** Case-insensitive request header lookup. */
  header(name: string): string | undefined;
}

/** Rejection descriptor returned by a guard. */
export interface GuardDeny {
  status: number;
  /** JSON-serializable body. Defaults to `{ title, status }`. */
  body?: unknown;
  /** Extra response headers on the denial (e.g. Retry-After). */
  headers?: Record<string, string>;
}

/** What a guard may return. `void`/`null`/`undefined` ⇒ pass. */
export interface GuardOutcome {
  /** Present ⇒ reject the request with this response. */
  deny?: GuardDeny;
  /** Attach the authenticated user (visible to later guards and `ctx.user`). */
  user?: unknown;
  /** Response headers to add when the request is allowed. */
  headers?: Record<string, string>;
}

export type GuardResult = void | null | undefined | GuardOutcome;

/** A transport-agnostic guard function. May be sync or async. */
export type KozoGuard = (req: GuardRequest) => GuardResult | Promise<GuardResult>;

/** A guard registered on the app, with its path pattern. */
export interface GuardEntry {
  pattern: string;
  guard: KozoGuard;
}

// ── Deny serialization (identical on both transports) ───────────────────────

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity',
  429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable',
};

function denyBodyJson(d: GuardDeny): string {
  return JSON.stringify(
    d.body ?? { title: STATUS_TITLES[d.status] ?? 'Request Denied', status: d.status },
  );
}

// ── Pattern compilation (Hono-style: ':param' segment, '*' rest) ────────────

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * Compile a middleware-style pattern ('/api/*', '/users/:id', '*') into a
 * RegExp matched against the request pathname. Used on the native path so a
 * guard registered on '/api/users/:id' does not run for '/api/posts/1' even
 * when both routes were conservatively associated at startup.
 */
export function compileGuardPattern(pattern: string): RegExp {
  if (pattern === '*' || pattern === '/*') return /(?:)/;
  let re = '';
  for (const seg of pattern.split('/').filter(Boolean)) {
    if (seg === '*') return new RegExp(`^${re}(?:/.*)?$`);
    re += '/' + (seg.startsWith(':') ? '[^/]+' : seg.replace(RE_ESCAPE, '\\$&'));
  }
  return new RegExp(`^${re}/?$`);
}

// ── Hono adapter (listen() and the uWS Hono bridge) ─────────────────────────

/**
 * Wrap a guard as a Hono middleware so `listen()` (and bridged routes under
 * `nativeListen()`) enforce exactly the same checks as the native path.
 */
export function guardToHonoMiddleware(guard: KozoGuard): MiddlewareHandler<KozoEnv> {
  return async (c, next) => {
    const u = new URL(c.req.url);
    const greq: GuardRequest = {
      method: c.req.method,
      path: u.pathname,
      url: u.pathname + u.search,
      remoteAddress: honoRemoteAddress(c),
      params: c.req.param() as Record<string, string>,
      get user() { return honoUser(c); },
      header: (n) => c.req.header(n),
    };
    const r = await guard(greq);
    if (r != null) {
      if (r.deny) {
        return new Response(denyBodyJson(r.deny), {
          status: r.deny.status,
          headers: { 'Content-Type': 'application/json', ...r.deny.headers },
        });
      }
      if (r.user !== undefined) (c as Context<KozoEnv>).set('user', r.user as any);
      if (r.headers) {
        await next();
        for (const k in r.headers) c.res.headers.set(k, r.headers[k]);
        return;
      }
    }
    return next();
  };
}

function honoUser(c: Context<KozoEnv>): unknown {
  try { return c.get('user') ?? null; } catch { return null; }
}

function honoRemoteAddress(c: Context<KozoEnv>): string {
  const raw = c.req.raw as { socket?: { remoteAddress?: string } } | undefined;
  const direct = raw?.socket?.remoteAddress;
  if (direct) return direct;
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? '';
}

// ── uWS native adapter ───────────────────────────────────────────────────────

interface CompiledGuard {
  re: RegExp;
  guard: KozoGuard;
}

export function compileGuards(entries: GuardEntry[]): CompiledGuard[] {
  return entries.map((e) => ({ re: compileGuardPattern(e.pattern), guard: e.guard }));
}

/**
 * Wrap a zero-shim uWS native handler with a guard chain.
 *
 * Stays fully synchronous when every guard is synchronous; switches to the
 * promise path only at the first async guard. Denials are written directly
 * via cork() — no Request/Response/Hono allocation on this path.
 */
export function wrapNativeWithGuards(
  guards: CompiledGuard[],
  inner: UwsNativeHandler,
  method: string,
): UwsNativeHandler {
  return (uwsRes, url, rawBody, params, corsHeaders, reqHeaders, remoteAddress = '') => {
    const qIdx = url.indexOf('?');
    const path = qIdx === -1 ? url : url.slice(0, qIdx);
    let user: unknown = null;
    let extraHeaders: [string, string][] | null = null;

    const greq: GuardRequest = {
      method,
      path,
      url,
      remoteAddress,
      params,
      get user() { return user; },
      header: (n) => reqHeaders?.[n.toLowerCase()],
    };

    const denyNow = (d: GuardDeny): void => {
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${d.status} ${STATUS_TITLES[d.status] ?? ''}`.trimEnd());
        uwsRes.writeHeader('Content-Type', 'application/json');
        if (d.headers) for (const k in d.headers) uwsRes.writeHeader(k, d.headers[k]);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, denyBodyJson(d));
      });
    };

    /** Returns true when the request was denied (stop the chain). */
    const apply = (r: GuardResult): boolean => {
      if (r == null) return false;
      if (r.deny) { denyNow(r.deny); return true; }
      if (r.user !== undefined) user = r.user;
      if (r.headers) {
        extraHeaders ??= [];
        for (const k in r.headers) extraHeaders.push([k, r.headers[k]]);
      }
      return false;
    };

    const proceed = (): void | Promise<void> => {
      const ch = extraHeaders ? [...(corsHeaders ?? []), ...extraHeaders] : corsHeaders;
      return inner(uwsRes, url, rawBody, params, ch, reqHeaders, remoteAddress, user);
    };

    let i = 0;
    const step = (): void | Promise<void> => {
      while (i < guards.length) {
        const g = guards[i++];
        if (!g.re.test(path)) continue;
        const r = g.guard(greq);
        if (r != null && typeof (r as Promise<GuardResult>).then === 'function') {
          return (r as Promise<GuardResult>).then((res) => {
            if (apply(res)) return;
            return step();
          });
        }
        if (apply(r as GuardResult)) return;
      }
      return proceed();
    };

    try {
      const p = step();
      if (p != null && typeof (p as Promise<void>).then === 'function') {
        return (p as Promise<void>).catch((err) => {
          uwsFastWriteError(err, uwsRes, corsHeaders);
        });
      }
    } catch (err) {
      uwsFastWriteError(err, uwsRes, corsHeaders);
    }
  };
}
