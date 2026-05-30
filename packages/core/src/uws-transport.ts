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

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as netCreateServer } from 'node:net';
import { KozoError } from './errors.js';
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

const BODY_413 = JSON.stringify({
  type: 'about:blank',
  title: 'Payload Too Large',
  status: 413,
  detail: 'Request body exceeds maximum allowed size',
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

/** Write a 200 JSON response directly to uWS. */
export function uwsFastWriteJson(uwsRes: UwsHttpRes, body: string, corsHeaders?: CorsHeaders): void {
  uwsRes.cork(() => {
    uwsRes.writeStatus('200 OK');
    uwsRes.writeHeader('Content-Type', CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(body);
  });
}

/** Write a JSON response with a custom HTTP status code. */
export function uwsFastWriteJsonStatus(uwsRes: UwsHttpRes, body: string, status: number, corsHeaders?: CorsHeaders): void {
  uwsRes.cork(() => {
    uwsRes.writeStatus(STATUS_TEXT[status] ?? `${status}`);
    uwsRes.writeHeader('Content-Type', CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(body);
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
  uwsRes.cork(() => {
    uwsRes.writeStatus('400 Bad Request');
    uwsRes.writeHeader('Content-Type', CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(body);
  });
}

/** Write a 500 Internal Server Error response. */
export function uwsFastWrite500(uwsRes: UwsHttpRes, corsHeaders?: CorsHeaders): void {
  uwsRes.cork(() => {
    uwsRes.writeStatus('500 Internal Server Error');
    uwsRes.writeHeader('Content-Type', CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(BODY_500);
  });
}

/** Write a KozoError or fall back to 500. */
export function uwsFastWriteError(err: unknown, uwsRes: UwsHttpRes, corsHeaders?: CorsHeaders): void {
  if (err instanceof KozoError) {
    const body = JSON.stringify({
      type:   `https://kozo-docs.vercel.app/docs/core/errors#${err.code}`,
      title:  err.message,
      status: err.statusCode,
    });
    uwsRes.cork(() => {
      uwsRes.writeStatus(STATUS_TEXT[err.statusCode] ?? `${err.statusCode}`);
      uwsRes.writeHeader('Content-Type', CT_PROBLEM);
      if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
      uwsRes.end(body);
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
  uwsRes.cork(() => {
    uwsRes.writeStatus('404 Not Found');
    uwsRes.writeHeader('Content-Type', 'application/problem+json');
    uwsRes.end(BODY_404);
  });
}

// ============================================================================
// Shim factories
// ============================================================================

/**
 * Lightweight fake ServerResponse.
 *
 * Our compiled handlers call:
 *   res.writeHead(status, [key, val, key, val, …])
 *   res.end(body)
 *
 * We capture the status + flat header array and flush everything via a single
 * uWS cork() call — zero extra syscalls.
 */
export function makeShimRes(uwsRes: UwsHttpRes): ServerResponse {
  let _status = 200;
  let _headers: string[] = [];

  return {
    writeHead(status: number, headers: string[]) {
      _status = status;
      _headers = headers;
    },
    end(body: string = '') {
      uwsRes.cork(() => {
        uwsRes.writeStatus(STATUS_TEXT[_status] ?? String(_status));
        for (let i = 0; i + 1 < _headers.length; i += 2) {
          // Skip Content-Length — uWS auto-computes it from the body passed to end().
          // Writing it manually would cause a "Duplicate Content-Length" parse error.
          if (_headers[i] === 'Content-Length') continue;
          uwsRes.writeHeader(_headers[i], _headers[i + 1]);
        }
        uwsRes.end(body);
      });
    },
  } as unknown as ServerResponse;
}

/**
 * Lightweight fake IncomingMessage for no-body routes (GET, DELETE, …).
 *
 * The compiled S1/S2 handlers only access req.method and req.url — nothing
 * else. We allocate a plain object with just those two fields.
 */
export function makeShimReqNoBody(method: string, url: string): IncomingMessage {
  return { method, url } as unknown as IncomingMessage;
}

/**
 * Lightweight fake IncomingMessage for body routes (POST, PUT, PATCH).
 *
 * readNativeBody() in compiler.ts does:
 *   req.on('data', chunk => …)
 *   req.on('end',  ()    => …)
 *   req.on('error', e   => …)
 *
 * We pre-buffer the body from uWS's onData, then replay it as a Node stream
 * using queueMicrotask so the Promise in readNativeBody resolves correctly.
 */
export function makeShimReqWithBody(method: string, url: string, rawBody: string): IncomingMessage {
  const dataListeners: Array<(chunk: Buffer) => void> = [];
  const endListeners: Array<() => void> = [];
  let scheduled = false;

  function scheduleEmit() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      const buf = rawBody ? Buffer.from(rawBody, 'utf8') : null;
      if (buf) for (const l of dataListeners) l(buf);
      for (const l of endListeners) l();
      // Clear listener arrays after emit to prevent memory leaks
      dataListeners.length = 0;
      endListeners.length = 0;
    });
  }

  return {
    method,
    url,
    on(event: string, listener: Function) {
      if (event === 'data') { dataListeners.push(listener as any); scheduleEmit(); }
      else if (event === 'end') { endListeners.push(listener as any); scheduleEmit(); }
      // 'error' listeners intentionally ignored — uWS aborts are handled separately
      return this;
    },
  } as unknown as IncomingMessage;
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
) => void | Promise<void>;

export interface UwsRouteEntry {
  method: string;          // uppercase: 'GET', 'POST', etc.
  path: string;            // original pattern: '/api/users/:id'
  paramNames: string[];    // extracted param names: ['id'] or []
  handler: UwsNativeHandler;
}

export interface UwsCorsConfig {
  origin?: string;
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

function buildCorsHeaders(cfg: UwsCorsConfig): [string, string][] {
  const h: [string, string][] = [
    ['Access-Control-Allow-Origin', cfg.origin ?? '*'],
    ['Access-Control-Allow-Methods', cfg.methods ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS'],
    ['Access-Control-Allow-Headers', cfg.headers ?? 'Content-Type,Authorization'],
  ];
  if (cfg.maxAge != null) h.push(['Access-Control-Max-Age', String(cfg.maxAge)]);
  if (cfg.credentials) h.push(['Access-Control-Allow-Credentials', 'true']);
  return h;
}

/**
 * Wrap a UwsNativeHandler with shutdown protection, CORS header injection,
 * and in-flight request tracking.
 * 
 * Optimization: passes corsHeaders directly to handler instead of creating
 * a wrapper object with 7 bound functions per request.
 */
function wrapHandler(
  h: UwsNativeHandler,
  corsHeaders: [string, string][] | null,
  isShuttingDown?: () => boolean,
  trackRequest?: () => () => void,
): UwsNativeHandler {
  if (!corsHeaders && !isShuttingDown && !trackRequest) return h;

  return (uwsRes, url, rawBody, params) => {
    // Reject during graceful shutdown
    if (isShuttingDown?.()) {
      uwsRes.cork(() => {
        uwsRes.writeStatus('503 Service Unavailable');
        uwsRes.writeHeader('Content-Type', CT_PROBLEM);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end(BODY_503);
      });
      return;
    }

    // Pass corsHeaders directly to handler — no wrapper allocation
    const untrack = trackRequest?.();
    if (!untrack) return h(uwsRes, url, rawBody, params, corsHeaders ?? undefined);
    try {
      const result = h(uwsRes, url, rawBody, params, corsHeaders ?? undefined);
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
      const remoteAddress = new TextDecoder().decode(ws.getRemoteAddressAsText());

      if (handler.open) handler.open(getOrCreateWrapper<T>(ws, remoteAddress));
    },
    message(ws, message, isBinary) {
      if (handler.message) {
        const data = isBinary ? message : new TextDecoder().decode(message);
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
  const { uws, routes, cors: corsConfig, isShuttingDown, trackRequest } = opts;
  // uWS does not support ephemeral port 0 — find a free port via node:net first
  const port = opts.port === 0 ? await getFreePort() : opts.port;
  const emptyParams = Object.freeze({}) as Record<string, string>;
  const corsHeaders = corsConfig ? buildCorsHeaders(corsConfig) : null;

  return new Promise((resolve, reject) => {
    const uwsApp = uws.App();

    // ── CORS preflight handler ──────────────────────────────────────────
    if (corsHeaders) {
      uwsApp.options('/*', (uwsRes) => {
        uwsRes.cork(() => {
          uwsRes.writeStatus('204 No Content');
          for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
          uwsRes.end();
        });
      });
    }

    // ── Register each route directly with uWS C++ router ────────────────
    for (const route of routes) {
      const fn = UWS_METHOD[route.method];
      if (!fn) continue;

      const h = wrapHandler(route.handler, corsHeaders, isShuttingDown, trackRequest);
      const names = route.paramNames;
      const hasParams = names.length > 0;
      const noBody = NO_BODY_METHODS.has(route.method);

      if (noBody && !hasParams) {
        // ── Fastest path: static GET/HEAD/DELETE/OPTIONS, no params ──────
        (uwsApp as any)[fn](route.path, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const query = uwsReq.getQuery();
          h(uwsRes, query ? `${uwsReq.getUrl()}?${query}` : uwsReq.getUrl(), '', emptyParams);
        });

      } else if (noBody && hasParams) {
        // ── GET/HEAD/DELETE with path params ─────────────────────────────
        (uwsApp as any)[fn](route.path, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const rawPath = uwsReq.getUrl();
          const query   = uwsReq.getQuery();
          const params: Record<string, string> = {};
          for (let i = 0; i < names.length; i++) params[names[i]] = uwsReq.getParameter(i);
          h(uwsRes, query ? `${rawPath}?${query}` : rawPath, '', params);
        });

      } else if (!hasParams) {
        // ── POST/PUT/PATCH without path params ──────────────────────────
        (uwsApp as any)[fn](route.path, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const rawPath = uwsReq.getUrl();
          const query   = uwsReq.getQuery();
          const url     = query ? `${rawPath}?${query}` : rawPath;
          const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
          let aborted = false;
          let totalBytes = 0;
          const chunks: Buffer[] = [];
          uwsRes.onAborted(() => { aborted = true; });
          uwsRes.onData((chunk, isLast) => {
            if (aborted) return;
            if (chunk.byteLength > 0) {
              totalBytes += chunk.byteLength;
              if (totalBytes > maxBody) {
                aborted = true;
                uwsRes.cork(() => {
                  uwsRes.writeStatus('413 Payload Too Large');
                  uwsRes.writeHeader('Content-Type', CT_PROBLEM);
                  uwsRes.end(BODY_413);
                });
                return;
              }
              chunks.push(Buffer.from(chunk));
            }
            if (isLast) {
              const bodyStr = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
              h(uwsRes, url, bodyStr, emptyParams);
            }
          });
        });

      } else {
        // ── POST/PUT/PATCH with path params ─────────────────────────────
        (uwsApp as any)[fn](route.path, (uwsRes: UwsHttpRes, uwsReq: UwsHttpReq) => {
          const rawPath = uwsReq.getUrl();
          const query   = uwsReq.getQuery();
          const url     = query ? `${rawPath}?${query}` : rawPath;
          const params: Record<string, string> = {};
          for (let i = 0; i < names.length; i++) params[names[i]] = uwsReq.getParameter(i);
          const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
          let aborted = false;
          let totalBytes = 0;
          const chunks: Buffer[] = [];
          uwsRes.onAborted(() => { aborted = true; });
          uwsRes.onData((chunk, isLast) => {
            if (aborted) return;
            if (chunk.byteLength > 0) {
              totalBytes += chunk.byteLength;
              if (totalBytes > maxBody) {
                aborted = true;
                uwsRes.cork(() => {
                  uwsRes.writeStatus('413 Payload Too Large');
                  uwsRes.writeHeader('Content-Type', CT_PROBLEM);
                  uwsRes.end(BODY_413);
                });
                return;
              }
              chunks.push(Buffer.from(chunk));
            }
            if (isLast) {
              const bodyStr = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
              h(uwsRes, url, bodyStr, params);
            }
          });
        });
      }
    }

    // ── Register WebSocket routes ──────────────────────────────────────
    if (opts.wsRoutes) {
      for (const wsRoute of opts.wsRoutes) {
        uwsApp.ws(wsRoute.path, buildWsBehavior(wsRoute.handler));
      }
    }

    // ── Catch-all 404 for unmatched routes ──────────────────────────────
    uwsApp.any('/*', (uwsRes) => {
      uwsRes.cork(() => {
        uwsRes.writeStatus('404 Not Found');
        uwsRes.writeHeader('Content-Type', CT_PROBLEM);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end(BODY_404);
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
