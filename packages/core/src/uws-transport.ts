// ============================================================================
// Kozo uWS Transport — uWebSockets.js adapter for nativeListen
// ============================================================================
//
// Architecture:
//
//   Each route is registered directly with uWS's C++ radix trie router
//   (app.get, app.post, …) — zero JS routing overhead per request.
//
//   Compiled handlers (UwsNativeHandler) are called with pre-extracted
//   parameters from uWS C++ — no WASM trie, no JS dispatch, no shims.
//
//     uWS C++ trie match → JS callback → UwsNativeHandler(uwsRes, url, body, params)
//
// Performance gains:
//   1. No IncomingMessage / ServerResponse object allocation
//   2. cork() batches all header + body writes into one kernel send()
//   3. C++ radix trie routes — zero JS routing per request
//   4. HTTP parser in C++ — zero JS allocation per header field
//   5. Zero-shim handlers write directly via cork()
//
// Usage:
//   const uws = await tryLoadUws();
//   if (uws) { /* use createUwsServer() */ }
//   else      { /* fall back to node:http */ }
// ============================================================================

import { createServer as netCreateServer } from 'node:net';
import { UTF8_DECODER, chunksToUtf8 } from './body-read.js';
import { KozoError, bodyTooLargeJson } from './errors.js';
import type { KozoWebSocket, WebSocketHandler, WsRouteEntry } from './ws.js';

// ── Minimal uWS type surface ─────────────────────────────────────────────────

export interface UwsBindings {
  App(): UwsApp;
  us_listen_socket_close(token: unknown): void;
}

export interface UwsApp {
  get(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  post(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  put(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  patch(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  del(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  options(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  head(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  any(pattern: string, handler: (res: UwsHttpRes, req: UwsHttpReq) => void): UwsApp;
  ws(pattern: string, behavior: UwsWebSocketBehavior): UwsApp;
  listen(port: number, cb: (listenSocket: unknown) => void): void;
}

export interface UwsHttpRes {
  cork(fn: () => void): void;
  writeStatus(status: string): UwsHttpRes;
  writeHeader(key: string, value: string): UwsHttpRes;
  end(body?: string): UwsHttpRes;
  onData(cb: (chunk: ArrayBuffer, isLast: boolean) => void): UwsHttpRes;
  onAborted(cb: () => void): UwsHttpRes;
  upgrade(userData: any, secWsKey: string, secWsProtocol: string, secWsExtensions: string, context: unknown): void;
  /** Valid only during the current uWS callback — decode synchronously. */
  getRemoteAddressAsText(): ArrayBuffer;
}

/**
 * CORS headers array type — passed to handlers to avoid wrapper object allocation.
 * Each request with CORS gets this array reference; handlers inject headers before end().
 */
export type CorsHeaders = [string, string][];

export interface UwsHttpReq {
  getMethod(): string;
  getUrl(): string;
  getQuery(): string;
  getParameter(index: number): string;
  getHeader(key: string): string;
  forEach(cb: (key: string, value: string) => void): void;
}

// ── uWS WebSocket type surface ───────────────────────────────────────────────

export interface UwsWebSocket {
  send(message: string | ArrayBuffer | Uint8Array, isBinary?: boolean, compress?: boolean): number;
  close(): void;
  subscribe(topic: string | ArrayBuffer): void;
  unsubscribe(topic: string | ArrayBuffer): void;
  publish(topic: string | ArrayBuffer, message: string | ArrayBuffer | Uint8Array, isBinary?: boolean, compress?: boolean): boolean;
  isSubscribed(topic: string): boolean;
  getRemoteAddressAsText(): ArrayBuffer;
  getUserData(): any;
}

export interface UwsWebSocketBehavior {
  upgrade?: (res: UwsHttpRes, req: UwsHttpReq, context: unknown) => void;
  open?: (ws: UwsWebSocket) => void;
  message?: (ws: UwsWebSocket, message: ArrayBuffer, isBinary: boolean) => void;
  close?: (ws: UwsWebSocket, code: number, message: ArrayBuffer) => void;
  drain?: (ws: UwsWebSocket) => void;
  maxPayloadLength?: number;
  idleTimeout?: number;
}

// ── Status text cache ─────────────────────────────────────────────────────────

const STATUS_TEXT: Record<number, string> = {
  200: '200 OK', 201: '201 Created', 204: '204 No Content',
  301: '301 Moved Permanently', 302: '302 Found',
  400: '400 Bad Request', 401: '401 Unauthorized', 403: '403 Forbidden',
  404: '404 Not Found', 405: '405 Method Not Allowed',
  422: '422 Unprocessable Entity', 429: '429 Too Many Requests',
  500: '500 Internal Server Error', 503: '503 Service Unavailable',
};

// ── Pre-built 404 body ────────────────────────────────────────────────────────

const BODY_404 = JSON.stringify({
  type: 'https://kozo-docs.vercel.app/docs/core/errors#not-found',
  title: 'Resource Not Found',
  status: 404,
});

// ── HTTP methods that never carry a request body ──────────────────────────────

const NO_BODY_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS', 'TRACE']);

// ── Content-Type constants ────────────────────────────────────────────────────

const CT_JSON    = 'application/json';
const CT_PROBLEM = 'application/problem+json';

// ── Pre-built 500 body ────────────────────────────────────────────────────────

const BODY_500 = JSON.stringify({
  type: 'https://kozo-docs.vercel.app/docs/core/errors#internal-error',
  title: 'Internal Server Error',
  status: 500,
});

const BODY_503 = JSON.stringify({
  type: 'about:blank',
  title: 'Service Unavailable',
  status: 503,
  detail: 'Server is shutting down, please retry later',
});

/** Default max request body size (1 MB). Can be overridden via UwsDispatchOptions. */
const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;

// ============================================================================
// uWS-native fast response functions
//
// These are zero-shim equivalents of fast-response.ts helpers.
// They write directly via cork() — no shimReq/shimRes allocation,
// no writeHead capture, no header loop indirection.
// ============================================================================

// ============================================================================
// uWS response lifecycle — skip writes after abort or after end() (autocannon)
// ============================================================================

const uwsAborted = new WeakMap<UwsHttpRes, boolean>();
const uwsFinished = new WeakMap<UwsHttpRes, boolean>();

export function isUwsAborted(uwsRes: UwsHttpRes): boolean {
  return uwsAborted.get(uwsRes) === true;
}

/** True when the uWS response can still accept writes. */
export function canWriteUws(uwsRes: UwsHttpRes): boolean {
  return !isUwsAborted(uwsRes) && uwsFinished.get(uwsRes) !== true;
}

function markUwsFinished(uwsRes: UwsHttpRes): void {
  uwsFinished.set(uwsRes, true);
}

/** End a uWS response and mark it finished (safe to call once). */
export function uwsSafeEnd(uwsRes: UwsHttpRes, body?: string): void {
  markUwsFinished(uwsRes);
  try {
    if (body === undefined) uwsRes.end();
    else uwsRes.end(body);
  } catch { /* response already closed */ }
}

function uwsCorkWrite(uwsRes: UwsHttpRes, fn: () => void): void {
  if (!canWriteUws(uwsRes)) return;
  try {
    uwsRes.cork(() => {
      if (!canWriteUws(uwsRes)) return;
      try {
        fn();
      } catch {
        markUwsFinished(uwsRes);
      }
    });
  } catch {
    markUwsFinished(uwsRes);
  }
}

/** Cork a custom response write (status/headers/end). Marks the response finished. */
export function uwsCorkRespond(uwsRes: UwsHttpRes, fn: () => void): void {
  uwsCorkWrite(uwsRes, fn);
}

/** Write a 200 JSON response directly to uWS. */
export function uwsFastWriteJson(uwsRes: UwsHttpRes, body: string, corsHeaders?: CorsHeaders): void {
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus('200 OK');
    uwsRes.writeHeader('Content-Type', CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, body);
  });
}

/** Write a JSON response with a custom HTTP status code. */
export function uwsFastWriteJsonStatus(uwsRes: UwsHttpRes, body: string, status: number, corsHeaders?: CorsHeaders): void {
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus(STATUS_TEXT[status] ?? `${status}`);
    uwsRes.writeHeader('Content-Type', CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, body);
  });
}

/** Write a 400 Validation Failed response. */
export function uwsFastWrite400(field: string, errors: any, uwsRes: UwsHttpRes, corsHeaders?: CorsHeaders): void {
  const body = JSON.stringify({
    type: 'https://kozo-docs.vercel.app/docs/core/errors#validation-failed',
    title: 'Validation Failed',
    status: 400,
    errors: (errors ?? []).map((e: any) => ({
      field:   e.instancePath?.replace(/^\//, '').replace(/\//g, '.') || e.params?.missingProperty || 'unknown',
      message: e.message || 'Invalid value',
      code:    e.keyword || 'invalid',
    })),
  });
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus('400 Bad Request');
    uwsRes.writeHeader('Content-Type', CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, body);
  });
}

/** Write a 500 Internal Server Error response. */
export function uwsFastWrite500(uwsRes: UwsHttpRes, corsHeaders?: CorsHeaders): void {
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus('500 Internal Server Error');
    uwsRes.writeHeader('Content-Type', CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, BODY_500);
  });
}

/** Write a KozoError or fall back to 500. */
export function uwsFastWriteError(err: unknown, uwsRes: UwsHttpRes, corsHeaders?: CorsHeaders): void {
  if (!canWriteUws(uwsRes)) return;
  if (err instanceof KozoError) {
    const body = JSON.stringify({
      type:   `https://kozo-docs.vercel.app/docs/core/errors#${err.code}`,
      title:  err.message,
      status: err.statusCode,
    });
    uwsCorkWrite(uwsRes, () => {
      uwsRes.writeStatus(STATUS_TEXT[err.statusCode] ?? `${err.statusCode}`);
      uwsRes.writeHeader('Content-Type', CT_PROBLEM);
      if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
      uwsSafeEnd(uwsRes, body);
    });
  } else {
    uwsFastWrite500(uwsRes, corsHeaders);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Try to load uWebSockets.js via CJS require (it ships as a native .node file).
 * Returns null if the module is not installed or fails to load.
 */
export async function tryLoadUws(): Promise<UwsBindings | null> {
  const { createRequire } = await import('node:module');

  // 1. Try relative to this package (normal install)
  try {
    const req = createRequire(import.meta.url);
    return req('uWebSockets.js') as UwsBindings;
  } catch { /* not found here */ }

  // 2. Fall back to the caller's cwd (e.g. pnpm workspace consumer)
  try {
    const req = createRequire(new URL(`file://${process.cwd()}/index.js`));
    return req('uWebSockets.js') as UwsBindings;
  } catch {
    return null;
  }
}

/**
 * Write a pre-built 404 response directly to a uWS response.
 */
export function uwsWrite404(uwsRes: UwsHttpRes): void {
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus('404 Not Found');
    uwsRes.writeHeader('Content-Type', 'application/problem+json');
    uwsSafeEnd(uwsRes, BODY_404);
  });
}

/** Capture client IP synchronously — uWS invalidates the buffer after the callback. */
export function readUwsRemoteAddress(uwsRes: UwsHttpRes): string {
  try {
    return UTF8_DECODER.decode(uwsRes.getRemoteAddressAsText());
  } catch {
    return '';
  }
}

// ============================================================================
// Core uWS dispatch factory
// ============================================================================

/**
 * Zero-shim uWS native handler signature.
 *
 * Parameters are passed directly from the uWS dispatcher:
 *   uwsRes  — uWS response (write via cork/writeStatus/writeHeader/end)
 *   url     — full URL including query string  e.g. '/api/users?page=1'
 *   rawBody — pre-buffered request body string (empty string for no-body routes)
 *   params  — path parameters extracted by the router  e.g. { id: '42' }
 *   corsHeaders — optional CORS headers to inject before end() (avoids wrapper allocation)
 */
export type UwsNativeHandler = (
  uwsRes: UwsHttpRes,
  url: string,
  rawBody: string,
  params: Record<string, string>,
  corsHeaders?: CorsHeaders,
  reqHeaders?: Record<string, string>,
  /** Client IP captured synchronously from uWS (empty when unavailable). */
  remoteAddress?: string,
  /** Authenticated user attached by a guard chain (see guard.ts). */
  user?: unknown,
) => void | Promise<void>;

export interface UwsRouteEntry {
  method: string;          // uppercase: 'GET', 'POST', etc.
  path: string;            // original pattern: '/api/users/:id'
  paramNames: string[];    // extracted param names: ['id'] or []
  handler: UwsNativeHandler;
}

// ============================================================================
// Hono middleware bridge
// ============================================================================

/**
 * True when a Hono middleware pattern can match requests served by a route
 * pattern. Used by `nativeListen()` to decide which routes must be bridged
 * through the Hono pipeline so `app.middleware()` handlers (auth, rate
 * limits, CORS, …) keep running under the uWS transport.
 *
 * Conservative by design: `:params` on either side match anything, so a
 * route is bridged whenever the pattern COULD apply to one of its requests.
 */
export function middlewarePatternOverlaps(pattern: string, routePath: string): boolean {
  if (pattern === '*' || pattern === '/*') return true;
  const p = pattern.split('/').filter(Boolean);
  const r = routePath.split('/').filter(Boolean);
  for (let i = 0; i < p.length; i++) {
    const ps = p[i];
    if (ps === '*') return true; // wildcard consumes the rest of the path
    const rs = r[i];
    if (rs === undefined) return false; // route is shorter than the pattern
    if (ps.startsWith(':') || rs.startsWith(':')) continue;
    if (ps !== rs) return false;
  }
  return p.length === r.length;
}

/** Copy Fetch response headers onto uWS — one writeHeader per Set-Cookie value. */
function writeFetchHeadersToUws(uwsRes: UwsHttpRes, responseHeaders: Headers): void {
  const setCookies =
    typeof responseHeaders.getSetCookie === 'function'
      ? responseHeaders.getSetCookie()
      : [];

  responseHeaders.forEach((v, k) => {
    const lower = k.toLowerCase();
    if (lower === 'content-length' || lower === 'set-cookie') return;
    uwsRes.writeHeader(k, v);
  });

  if (setCookies.length > 0) {
    for (const cookie of setCookies) uwsRes.writeHeader('Set-Cookie', cookie);
    return;
  }

  const legacy = responseHeaders.get('set-cookie');
  if (legacy) uwsRes.writeHeader('Set-Cookie', legacy);
}

/**
 * UwsNativeHandler that forwards the request to the Hono fetch pipeline —
 * middlewares included — and writes the Response back through cork().
 *
 * This is the correctness path: routes covered by `app.middleware()` get the
 * exact same semantics as `listen()`. Uncovered routes keep the zero-shim
 * native path, so the bridge costs nothing where no middleware applies.
 *
 * Limitations (by design): request and response bodies are buffered in full
 * before/after the Hono pipeline — no SSE or chunked streaming. Prefer
 * `listen()` or a zero-shim native route for streaming responses.
 */
export function makeUwsHonoBridge(
  method: string,
  honoFetch: (req: Request) => Response | Promise<Response>,
): UwsNativeHandler {
  const canHaveBody = !NO_BODY_METHODS.has(method);
  return async (uwsRes, url, rawBody, _params, corsHeaders, reqHeaders) => {
    try {
      const headers = new Headers();
      if (reqHeaders) for (const k in reqHeaders) headers.set(k, reqHeaders[k]);
      const request = new Request(`http://kozo.uws${url}`, {
        method,
        headers,
        body: canHaveBody && rawBody.length > 0 ? rawBody : undefined,
      });
      const response = await honoFetch(request);
      const body =
        response.status === 204 || response.status === 304 ? undefined : await response.text();
      uwsCorkWrite(uwsRes, () => {
        uwsRes.writeStatus(STATUS_TEXT[response.status] ?? String(response.status));
        writeFetchHeadersToUws(uwsRes, response.headers);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, body);
      });
    } catch {
      uwsFastWrite500(uwsRes, corsHeaders);
    }
  };
}

export interface UwsCorsConfig {
  /**
   * Allowed origin. A single string is injected statically; an array enables
   * per-request origin echo (the request's Origin header is reflected when it
   * is in the list, with `Vary: Origin`).
   */
  origin?: string | string[];
  methods?: string;
  headers?: string;
  maxAge?: number;
  credentials?: boolean;
}

export interface UwsDispatchOptions {
  uws: UwsBindings;
  /** Routes to register directly with uWS C++ router. */
  routes: UwsRouteEntry[];
  port: number;
  /** Optional CORS config — adds headers to every response + handles OPTIONS preflight. */
  cors?: UwsCorsConfig;
  /** Returns true while the server is draining (shutdown in progress). */
  isShuttingDown?: () => boolean;
  /** Track an in-flight request; returns an untrack callback. */
  trackRequest?: () => () => void;
  /** WebSocket route entries. */
  wsRoutes?: WsRouteEntry[];
  /** Max request body size in bytes (default: 1 MB). */
  maxBodyBytes?: number;
}

/**
 * Find an available TCP port (for port=0 ephemeral binding with uWS).\
 * We ask node:net for a free port, then release it before handing it to uWS.
 * Slight race condition is acceptable — this is startup-only.
 */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netCreateServer();
    srv.listen(0, '0.0.0.0', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close((err) => err ? reject(err) : resolve(port));
    });
  });
}

// ── uWS method name map (HTTP verb → uWS app method) ─────────────────────────

const UWS_METHOD: Record<string, string> = {
  GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch',
  DELETE: 'del', OPTIONS: 'options', HEAD: 'head',
};

// ── CORS + shutdown helpers ──────────────────────────────────────────────────

function buildCorsHeadersFor(cfg: UwsCorsConfig, origin: string): CorsHeaders {
  const h: CorsHeaders = [
    ['Access-Control-Allow-Origin', origin],
    ['Access-Control-Allow-Methods', cfg.methods ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS'],
    ['Access-Control-Allow-Headers', cfg.headers ?? 'Content-Type,Authorization'],
  ];
  if (Array.isArray(cfg.origin)) h.push(['Vary', 'Origin']);
  if (cfg.maxAge != null) h.push(['Access-Control-Max-Age', String(cfg.maxAge)]);
  if (cfg.credentials) h.push(['Access-Control-Allow-Credentials', 'true']);
  return h;
}

/**
 * Per-request CORS resolver for origin lists: echoes the request Origin when
 * allowed, otherwise emits no CORS headers (browser blocks the response).
 * Header arrays are cached per origin — the list is small and static.
 */
function makeCorsResolver(cfg: UwsCorsConfig): (origin: string | undefined) => CorsHeaders | undefined {
  const allowed = cfg.origin as string[];
  const cache = new Map<string, CorsHeaders>();
  return (origin) => {
    if (!origin || !allowed.includes(origin)) return undefined;
    let h = cache.get(origin);
    if (!h) { h = buildCorsHeadersFor(cfg, origin); cache.set(origin, h); }
    return h;
  };
}

/**
 * Wrap a UwsNativeHandler with shutdown protection, CORS header injection,
 * and in-flight request tracking.
 * 
 * Optimization: passes corsHeaders directly to handler instead of creating
 * a wrapper object with 7 bound functions per request.
 */
/**
 * uWS forbids returning from a route handler while a response is still pending
 * unless an abort handler is registered (POST routes get this via onData setup).
 */
function attachAbortGuard(uwsRes: UwsHttpRes): void {
  uwsRes.onAborted(() => {
    uwsAborted.set(uwsRes, true);
    markUwsFinished(uwsRes);
  });
}

function collectReqHeaders(uwsReq: UwsHttpReq): Record<string, string> {
  const headers: Record<string, string> = {};
  uwsReq.forEach((k, v) => { headers[k.toLowerCase()] = v; });
  return headers;
}

function wrapHandler(
  h: UwsNativeHandler,
  corsHeaders: CorsHeaders | null,
  isShuttingDown?: () => boolean,
  trackRequest?: () => () => void,
  corsResolver?: ((origin: string | undefined) => CorsHeaders | undefined) | null,
): UwsNativeHandler {
  return (uwsRes, url, rawBody, params, corsHeadersArg, reqHeaders, remoteAddress, user) => {
    const cors =
      corsHeadersArg ??
      (corsResolver ? corsResolver(reqHeaders?.origin) : corsHeaders ?? undefined);

    // Reject during graceful shutdown
    if (isShuttingDown?.()) {
      uwsCorkWrite(uwsRes, () => {
        uwsRes.writeStatus('503 Service Unavailable');
        uwsRes.writeHeader('Content-Type', CT_PROBLEM);
        if (cors) for (const [k, v] of cors) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, BODY_503);
      });
      return;
    }

    attachAbortGuard(uwsRes);

    if (!trackRequest) {
      return h(uwsRes, url, rawBody, params, cors, reqHeaders, remoteAddress, user);
    }

    const untrack = trackRequest();
    try {
      const result = h(uwsRes, url, rawBody, params, cors, reqHeaders, remoteAddress, user);
      if (result && typeof (result as any).then === 'function') {
        (result as Promise<void>).then(untrack, untrack);
      } else {
        untrack();
      }
    } catch {
      untrack();
    }
  };
}

// ============================================================================
// WebSocket support
// ============================================================================

/**
 * Create a KozoWebSocket wrapper around a raw uWS WebSocket.
 * Allocated once per connection in `open` — reused in message/close/drain.
 *
 * IMPORTANT: remoteAddress is captured synchronously during wrapper creation
 * because uWS's getRemoteAddressAsText() returns an ArrayBuffer that is only
 * valid during the current uWS callback. Accessing it after an await would
 * read from reallocated memory and return corrupted data.
 */
function wrapUwsWs<T>(ws: UwsWebSocket, remoteAddress: string): KozoWebSocket<T> {
  return {
    send(data, isBinary = false) { ws.send(data, isBinary); },
    close() { ws.close(); },
    subscribe(topic) { ws.subscribe(topic); },
    unsubscribe(topic) { ws.unsubscribe(topic); },
    publish(topic, data, isBinary = false) { ws.publish(topic, data, isBinary); },
    isSubscribed(topic) { return ws.isSubscribed(topic); },
    get remoteAddress() { return remoteAddress; },
    get data() { return (ws.getUserData() as any)?._data as T; },
    set data(val: T) { (ws.getUserData() as any)._data = val; },
  };
}

/** Map raw uWS WebSocket → KozoWebSocket wrapper (one per connection). */
const wsWrappers = new WeakMap<UwsWebSocket, KozoWebSocket<any>>();

function getOrCreateWrapper<T>(ws: UwsWebSocket, remoteAddress: string): KozoWebSocket<T> {
  let wrapped = wsWrappers.get(ws);
  if (!wrapped) {
    wrapped = wrapUwsWs<T>(ws, remoteAddress);
    wsWrappers.set(ws, wrapped);
  }
  return wrapped;
}

/**
 * Build uWS WebSocketBehavior from a Kozo WebSocketHandler.
 *
 * CRITICAL uWS SAFETY RULES:
 * 1. All req/res data must be read synchronously — uWS frees them after the callback returns
 * 2. For async upgrade: register onAborted() BEFORE any await, check aborted before every res operation
 * 3. res.upgrade() must NOT be wrapped in cork() — it's not an HTTP write operation
 * 4. remoteAddress must be captured in 'open' callback, not lazily via getter
 */
function buildWsBehavior<T>(handler: WebSocketHandler<T>): UwsWebSocketBehavior {
  return {
    maxPayloadLength: handler.maxPayloadLength ?? 1024 * 1024,
    idleTimeout: handler.idleTimeout ?? 120,

    upgrade(res, req, context) {
      // Must read all request data synchronously — uWS frees req after callback
      const url = req.getUrl();
      const query = req.getQuery();
      const secWsKey = req.getHeader('sec-websocket-key');
      const secWsProtocol = req.getHeader('sec-websocket-protocol');
      const secWsExtensions = req.getHeader('sec-websocket-extensions');
      const headers: Record<string, string> = {};
      req.forEach((k, v) => { headers[k] = v; });

      if (!handler.upgrade) {
        res.upgrade({ _data: {} as T }, secWsKey, secWsProtocol, secWsExtensions, context);
        return;
      }

      // Register onAborted BEFORE any async operation to prevent SIGABRT
      // if the client disconnects during await
      let aborted = false;
      res.onAborted(() => { aborted = true; });

      const result = handler.upgrade({ url, query, headers });

      if (result && typeof (result as any).then === 'function') {
        // Async upgrade (e.g. JWT verification)
        // WARNING: There's an inherent race condition between checking `aborted`
        // and calling res.upgrade(). uWS does not provide an atomic check-and-upgrade.
        // If the client disconnects in this microtask window, the process may crash.
        // This is a known uWS limitation — keep upgrade hooks as fast as possible.
        (result as Promise<T | false>).then((userData) => {
          // Check aborted BEFORE any res operation
          if (aborted) return;

          if (userData === false) {
            res.cork(() => { res.writeStatus('401 Unauthorized').end(); });
            return;
          }

          // Final check right before upgrade (still not atomic, but minimizes window)
          if (aborted) return;

          // DO NOT wrap upgrade() in cork() — it's not an HTTP write
          res.upgrade({ _data: userData }, secWsKey, secWsProtocol, secWsExtensions, context);
        }).catch(() => {
          // Check aborted before writing error response
          if (aborted) return;
          res.cork(() => { res.writeStatus('500 Internal Server Error').end(); });
        });
      } else {
        // Synchronous upgrade — no race condition possible
        if (result === false) {
          res.writeStatus('401 Unauthorized').end();
          return;
        }
        res.upgrade({ _data: result }, secWsKey, secWsProtocol, secWsExtensions, context);
      }
    },

    open(ws) {
      // Capture remoteAddress SYNCHRONOUSLY in the 'open' callback.
      // The ArrayBuffer from getRemoteAddressAsText() is only valid during this callback.
      // Storing it lazily in a getter would cause memory corruption if accessed after an await.
      const remoteAddress = UTF8_DECODER.decode(ws.getRemoteAddressAsText());

      if (handler.open) handler.open(getOrCreateWrapper<T>(ws, remoteAddress));
    },
    message(ws, message, isBinary) {
      if (handler.message) {
        const data = isBinary ? message : UTF8_DECODER.decode(message);
        // remoteAddress was already captured in 'open', wrapper is cached
        const wrapped = wsWrappers.get(ws);
        if (wrapped && handler.message) {
          handler.message(wrapped, data, isBinary);
        }
      }
    },
    close(ws, code, message) {
      const wrapped = wsWrappers.get(ws);
      if (wrapped && handler.close) handler.close(wrapped, code, message);
      wsWrappers.delete(ws);
    },
    drain(ws) {
      const wrapped = wsWrappers.get(ws);
      if (wrapped && handler.drain) handler.drain(wrapped);
    },
  };
}

// ============================================================================
// Core uWS HTTP server factory
// ============================================================================

/**
 * Create a uWS HTTP server with native per-route C++ matching.
 *
 * Each route is registered directly with uWS (app.get, app.post, …) so the
 * C++ radix trie handles all URL matching — zero JS routing overhead.
 * A catch-all `any('/*')` returns 404 for unmatched paths.
 *
 * Returns { port, server } matching the nativeListen contract.
 */
export async function createUwsServer(opts: UwsDispatchOptions): Promise<{ port: number; server: { close(): void } }> {
  // uWS does not support ephemeral port 0 — we grab a free port via node:net
  // first. That is inherently racy (another process can claim the port between
  // release and uWS bind), so ephemeral binds retry with a fresh port.
  const ephemeral = opts.port === 0;
  const attempts = ephemeral ? 5 : 1;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const port = ephemeral ? await getFreePort() : opts.port;
    try {
      return await listenUwsOnPort(opts, port);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** One concrete uWS registration derived from a route pattern. */
export interface UwsPatternVariant {
  /** uWS-compatible pattern (no `?` — uWS has no optional-param syntax). */
  pattern: string;
  /** Param names aligned with `pattern`, with any trailing `?` stripped. */
  paramNames: string[];
}

/**
 * Expand a route pattern into the concrete uWS registrations needed to mirror
 * Hono's optional-param (`:id?`) semantics.
 *
 * uWS's C++ radix router has no optional-param syntax: `/opt/:id?` is taken
 * literally, so the param name becomes `id?` (never read as `id`) and the
 * id-absent form (`/opt`) never matches → 404. To match `listen()` we:
 *   1. strip the trailing `?` from param names, and
 *   2. emit one variant per trailing optional segment — both the form that
 *      includes the segment (`/opt/:id`) and the form that omits it (`/opt`).
 *
 * Patterns without an optional param take a zero-cost fast path (the same
 * `paramNames` reference is returned). Only *trailing* optional segments are
 * made truly optional; a `?` on a non-trailing segment still has its name
 * normalized but is not expanded into an absent form.
 */
export function expandUwsPatterns(path: string, paramNames: string[]): UwsPatternVariant[] {
  if (!path.includes('?')) return [{ pattern: path, paramNames }];

  const segs = path.split('/');
  const isOptional = (seg: string): boolean => seg.startsWith(':') && seg.endsWith('?');
  const patternOf = (slice: string[]): string =>
    slice.map((s) => (isOptional(s) ? s.slice(0, -1) : s)).join('/') || '/';
  const namesOf = (slice: string[]): string[] => {
    const out: string[] = [];
    for (const s of slice) {
      if (s.startsWith(':')) out.push(s.slice(1, isOptional(s) ? -1 : undefined));
    }
    return out;
  };

  const variants: UwsPatternVariant[] = [];
  let end = segs.length;
  while (end > 0) {
    const slice = segs.slice(0, end);
    variants.push({ pattern: patternOf(slice), paramNames: namesOf(slice) });
    if (isOptional(segs[end - 1])) end--;
    else break;
  }
  return variants;
}

function listenUwsOnPort(opts: UwsDispatchOptions, port: number): Promise<{ port: number; server: { close(): void } }> {
  const { uws, routes, cors: corsConfig, isShuttingDown, trackRequest } = opts;
  const emptyParams = Object.freeze({}) as Record<string, string>;
  // Single origin (or '*') → static headers; origin list → per-request echo.
  const corsResolver = corsConfig && Array.isArray(corsConfig.origin)
    ? makeCorsResolver(corsConfig)
    : null;
  const corsHeaders = corsConfig && !corsResolver
    ? buildCorsHeadersFor(corsConfig, (corsConfig.origin as string | undefined) ?? '*')
    : null;

  return new Promise((resolve, reject) => {
    const uwsApp = uws.App();

    // ── CORS preflight handler ──────────────────────────────────────────
    if (corsConfig) {
      uwsApp.options('/*', (uwsRes, uwsReq) => {
        const headers = corsResolver
          ? corsResolver(uwsReq.getHeader('origin') || undefined)
          : corsHeaders;
        uwsCorkWrite(uwsRes, () => {
          uwsRes.writeStatus('204 No Content');
          if (headers) for (const [k, v] of headers) uwsRes.writeHeader(k, v);
          uwsSafeEnd(uwsRes);
        });
      });
    }

    // ── Register each route directly with uWS C++ router ────────────────
    for (const route of routes) {
      const fn = UWS_METHOD[route.method];
      if (!fn) continue;

      const h = wrapHandler(route.handler, corsHeaders, isShuttingDown, trackRequest, corsResolver);
      const noBody = NO_BODY_METHODS.has(route.method);

      // A route with an optional param (`:id?`) expands into multiple uWS
      // registrations — see expandUwsPatterns(). Non-optional routes yield a
      // single variant, so this loop is zero-overhead for the common case.
      for (const variant of expandUwsPatterns(route.path, route.paramNames)) {
        const pattern = variant.pattern;
        const names = variant.paramNames;
        const hasParams = names.length > 0;

        if (noBody && !hasParams) {
        // ── Fastest path: static GET/HEAD/DELETE/OPTIONS, no params ──────
        (uwsApp as any)[fn](pattern, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const remoteAddress = readUwsRemoteAddress(uwsRes);
          const reqHeaders = collectReqHeaders(uwsReq);
          const query = uwsReq.getQuery();
          h(uwsRes, query ? `${uwsReq.getUrl()}?${query}` : uwsReq.getUrl(), '', emptyParams, undefined, reqHeaders, remoteAddress);
        });

      } else if (noBody && hasParams) {
        // ── GET/HEAD/DELETE with path params ─────────────────────────────
        (uwsApp as any)[fn](pattern, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const remoteAddress = readUwsRemoteAddress(uwsRes);
          const reqHeaders = collectReqHeaders(uwsReq);
          const rawPath = uwsReq.getUrl();
          const query   = uwsReq.getQuery();
          const params: Record<string, string> = {};
          for (let i = 0; i < names.length; i++) params[names[i]] = uwsReq.getParameter(i);
          h(uwsRes, query ? `${rawPath}?${query}` : rawPath, '', params, undefined, reqHeaders, remoteAddress);
        });

      } else if (!hasParams) {
        // ── POST/PUT/PATCH without path params ──────────────────────────
        (uwsApp as any)[fn](pattern, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const remoteAddress = readUwsRemoteAddress(uwsRes);
          const reqHeaders = collectReqHeaders(uwsReq);
          const rawPath = uwsReq.getUrl();
          const query   = uwsReq.getQuery();
          const url     = query ? `${rawPath}?${query}` : rawPath;
          const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
          let aborted = false;
          let totalBytes = 0;
          const chunks: Buffer[] = [];
          uwsRes.onAborted(() => { aborted = true; uwsAborted.set(uwsRes, true); markUwsFinished(uwsRes); });
          uwsRes.onData((chunk, isLast) => {
            if (aborted) return;
            if (chunk.byteLength > 0) {
              totalBytes += chunk.byteLength;
              if (totalBytes > maxBody) {
                aborted = true;
                uwsCorkWrite(uwsRes, () => {
                  uwsRes.writeStatus('413 Payload Too Large');
                  uwsRes.writeHeader('Content-Type', CT_PROBLEM);
                  uwsSafeEnd(uwsRes, bodyTooLargeJson(maxBody));
                });
                return;
              }
              chunks.push(Buffer.from(chunk));
            }
            if (isLast) {
              const bodyStr = chunksToUtf8(chunks);
              h(uwsRes, url, bodyStr, emptyParams, undefined, reqHeaders, remoteAddress);
            }
          });
        });

      } else {
        // ── POST/PUT/PATCH with path params ─────────────────────────────
        (uwsApp as any)[fn](pattern, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const remoteAddress = readUwsRemoteAddress(uwsRes);
          const reqHeaders = collectReqHeaders(uwsReq);
          const rawPath = uwsReq.getUrl();
          const query   = uwsReq.getQuery();
          const url     = query ? `${rawPath}?${query}` : rawPath;
          const params: Record<string, string> = {};
          for (let i = 0; i < names.length; i++) params[names[i]] = uwsReq.getParameter(i);
          const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
          let aborted = false;
          let totalBytes = 0;
          const chunks: Buffer[] = [];
          uwsRes.onAborted(() => { aborted = true; uwsAborted.set(uwsRes, true); markUwsFinished(uwsRes); });
          uwsRes.onData((chunk, isLast) => {
            if (aborted) return;
            if (chunk.byteLength > 0) {
              totalBytes += chunk.byteLength;
              if (totalBytes > maxBody) {
                aborted = true;
                uwsCorkWrite(uwsRes, () => {
                  uwsRes.writeStatus('413 Payload Too Large');
                  uwsRes.writeHeader('Content-Type', CT_PROBLEM);
                  uwsSafeEnd(uwsRes, bodyTooLargeJson(maxBody));
                });
                return;
              }
              chunks.push(Buffer.from(chunk));
            }
            if (isLast) {
              const bodyStr = chunksToUtf8(chunks);
              h(uwsRes, url, bodyStr, params, undefined, reqHeaders, remoteAddress);
            }
          });
        });
      }
      }
    }

    // ── Register WebSocket routes ──────────────────────────────────────
    if (opts.wsRoutes) {
      for (const wsRoute of opts.wsRoutes) {
        uwsApp.ws(wsRoute.path, buildWsBehavior(wsRoute.handler));
      }
    }

    // ── Catch-all 404 for unmatched routes ──────────────────────────────
    uwsApp.any('/*', (uwsRes, uwsReq) => {
      const ch = corsResolver ? corsResolver(uwsReq.getHeader('origin') || undefined) : corsHeaders;
      uwsCorkWrite(uwsRes, () => {
        uwsRes.writeStatus('404 Not Found');
        uwsRes.writeHeader('Content-Type', CT_PROBLEM);
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, BODY_404);
      });
    });

    let listenToken: unknown = null;

    uwsApp.listen(port, (token) => {
      if (!token) {
        reject(new Error(`[Kozo] uWS failed to listen on port ${port}`));
        return;
      }
      listenToken = token;

      resolve({
        port,
        server: {
          close() {
            if (listenToken) uws.us_listen_socket_close(listenToken);
          },
        },
      });
    });
  });
}
