// ============================================================================
// Kozo NativeContext — Runtime implementation of NativeKozoContext
// ============================================================================
//
// This module provides the `buildNativeContext()` factory that creates the
// typed context object passed to `NativeKozoHandler` functions.
//
// The context wraps Node.js IncomingMessage / ServerResponse and adds:
//   • Lazy query/headers parsing (only on first access)
//   • Type-safe params, body, query from schema
//   • Response helpers: json(), text(), html(), redirect(), header()
//   • Cork/uncork socket batching via fast-response.ts utilities
//
// V8 Hidden Class: all properties are declared upfront in the object literal,
// even if initially undefined.  This prevents shape transitions that would
// deoptimize property access.
// ============================================================================

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Services, RouteSchema, NativeKozoContext } from './types.js';
import { fastWriteJson, fastWriteText, fastWriteHtml, fastWriteJsonStatus, fastCL } from './fast-response.js';

/**
 * Fast query-string parser that avoids the URLSearchParams constructor (~2-3µs saving).
 * Handles percent-encoding and `+` as space only when needed.
 */
export function fastParseQuery(qs: string): Record<string, string> {
  const result: Record<string, string> = {};
  let start = 0;
  const len = qs.length;
  while (start < len) {
    let eqIdx = -1;
    let end = len;
    for (let i = start; i < len; i++) {
      const ch = qs.charCodeAt(i);
      if (ch === 61 /* = */ && eqIdx === -1) eqIdx = i;
      else if (ch === 38 /* & */) { end = i; break; }
    }
    if (eqIdx > start) {
      const key = qs.slice(start, eqIdx);
      const raw = qs.slice(eqIdx + 1, end);
      result[key] = (raw.indexOf('%') !== -1 || raw.indexOf('+') !== -1)
        ? decodeURIComponent(raw.replace(/\+/g, ' '))
        : raw;
    }
    start = end + 1;
  }
  return result;
}

/**
 * Build a NativeKozoContext for a native route handler.
 *
 * Called by the native handler compiler (`compiler.ts`) when the route
 * is registered via `nativeRoute()`.  Not intended for direct use.
 *
 * @internal
 */
export function buildNativeContext<S extends RouteSchema, TSvc extends Services>(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  body: any,
  services: TSvc,
  serialize?: (data: any) => string,
): NativeKozoContext<S, TSvc> {
  // Lazy-parsed query cache
  let _query: Record<string, string> | undefined;
  // Extra headers set via ctx.header()
  let _extraHeaders: [string, string][] | undefined;

  const ctx: NativeKozoContext<S, TSvc> = {
    req,
    res,
    params: params as any,
    body: body as any,
    services,

    get query(): any {
      if (_query === undefined) {
        const url = req.url ?? '/';
        const qIdx = url.indexOf('?');
        if (qIdx === -1) {
          _query = {};
        } else {
          _query = fastParseQuery(url.slice(qIdx + 1));
        }
      }
      return _query;
    },

    json(data: any, status?: number): void {
      const jsonBody = serialize ? serialize(data) : JSON.stringify(data);
      if (_extraHeaders) {
        const hdrs: string[] = ['Content-Type', 'application/json', 'Content-Length', fastCL(Buffer.byteLength(jsonBody))];
        for (const [k, v] of _extraHeaders) hdrs.push(k, v);
        res.writeHead(status ?? 200, hdrs);
        res.end(jsonBody);
      } else if (status !== undefined && status !== 200) {
        fastWriteJsonStatus(res, jsonBody, status);
      } else {
        fastWriteJson(res, jsonBody);
      }
    },

    text(data: string, status?: number): void {
      fastWriteText(res, data, status ?? 200);
    },

    html(data: string, status?: number): void {
      fastWriteHtml(res, data, status ?? 200);
    },

    header(name: string, value: string) {
      if (!_extraHeaders) _extraHeaders = [];
      _extraHeaders.push([name, value]);
      return ctx;
    },

    redirect(url: string, status?: number): void {
      const code = status ?? 302;
      res.writeHead(code, ['Location', url, 'Content-Length', '0']);
      res.end();
    },
  };

  return ctx;
}
