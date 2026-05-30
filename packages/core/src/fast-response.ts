// ============================================================================
// Kozo Fast Response — Optimized HTTP response writing for nativeListen
// ============================================================================
//
// Key optimisations over vanilla Node.js ServerResponse:
//
//   1. ASCII body length  →  JSON output is always ASCII-safe (fast-json-
//      stringify escapes non-ASCII to \uXXXX).  body.length === byte length,
//      so we skip the expensive Buffer.byteLength() call (~60–100 ns saved).
//
//   2. Content-Length cache  →  pre-computed String(n) for sizes 0–9999
//      avoids per-request String() conversion (~12 ns saved).
//
//   3. Pre-built error buffers  →  404 / 500 responses are constant strings,
//      written once at import time.  Zero allocation on error paths.
//
// These utilities are used internally by the native handler compiler
// (compiler.ts) and the nativeListen dispatch function (app.ts).
// They are NOT part of the public developer API.
// ============================================================================

import type { ServerResponse } from 'node:http';
import { KozoError } from './errors.js';

// ── Content-Length string cache ─────────────────────────────────────────
// Lazy-initialized cache for sizes 0–9999 (covers 99%+ of JSON API responses).
// Avoids `String(n)` allocation on every request. Populated on first use.
let CL_CACHE: string[] | null = null;

/** Fast number → string for Content-Length. Cached for values < 10 000. */
export function fastCL(n: number): string {
  if (n < 10_000) {
    if (!CL_CACHE) {
      CL_CACHE = new Array<string>(10_000);
      for (let i = 0; i < 10_000; i++) CL_CACHE[i] = String(i);
    }
    return CL_CACHE[n];
  }
  return String(n);
}

// ── Content-Type constants ──────────────────────────────────────────────
const CT_JSON    = 'application/json';
const CT_PROBLEM = 'application/problem+json';
const CT_TEXT    = 'text/plain';
const CT_HTML    = 'text/html; charset=utf-8';

// ── Pre-built error response buffers ────────────────────────────────────
const BODY_404 = JSON.stringify({
  type: 'https://kozo-docs.vercel.app/docs/core/errors#not-found',
  title: 'Resource Not Found',
  status: 404,
});
const LEN_404 = fastCL(Buffer.byteLength(BODY_404));

const BODY_500 = JSON.stringify({
  type: 'https://kozo-docs.vercel.app/docs/core/errors#internal-error',
  title: 'Internal Server Error',
  status: 500,
});
const LEN_500 = fastCL(Buffer.byteLength(BODY_500));

// ════════════════════════════════════════════════════════════════════════
// Public helpers — used by compiler.ts native handler scenarios
// ════════════════════════════════════════════════════════════════════════

/**
 * Write a 200 JSON response.
 *
 * Uses `Buffer.byteLength(body)` for Content-Length to correctly handle
 * any UTF-8 content in the body (emoji, non-ASCII characters, etc.).
 */
export function fastWriteJson(res: ServerResponse, body: string): void {
  const len = Buffer.byteLength(body);
  res.writeHead(200, [
    'Content-Type', CT_JSON,
    'Content-Length', fastCL(len),
  ]);
  res.end(body);
}

/**
 * Write a plain text response.
 */
export function fastWriteText(res: ServerResponse, body: string, status: number = 200): void {
  const len = Buffer.byteLength(body); // text may contain UTF-8
  res.writeHead(status, [
    'Content-Type', CT_TEXT,
    'Content-Length', fastCL(len),
  ]);
  res.end(body);
}

/**
 * Write an HTML response (SSR page rendering).
 */
export function fastWriteHtml(res: ServerResponse, body: string, status: number = 200): void {
  const len = Buffer.byteLength(body); // HTML may contain UTF-8
  res.writeHead(status, [
    'Content-Type', CT_HTML,
    'Content-Length', fastCL(len),
  ]);
  res.end(body);
}

/**
 * Write a JSON response with a custom status code.
 */
export function fastWriteJsonStatus(res: ServerResponse, body: string, status: number): void {
  const len = Buffer.byteLength(body);
  res.writeHead(status, [
    'Content-Type', CT_JSON,
    'Content-Length', fastCL(len),
  ]);
  res.end(body);
}

/**
 * Write a pre-built 404 Not Found response (zero allocation).
 */
export function fastWrite404(res: ServerResponse): void {
  res.writeHead(404, [
    'Content-Type', CT_PROBLEM,
    'Content-Length', LEN_404,
  ]);
  res.end(BODY_404);
}

/**
 * Write a pre-built 500 Internal Server Error response (zero allocation).
 */
export function fastWrite500(res: ServerResponse): void {
  res.writeHead(500, [
    'Content-Type', CT_PROBLEM,
    'Content-Length', LEN_500,
  ]);
  res.end(BODY_500);
}

/**
 * Write a 400 validation error response.
 * Allocates only the error body string.
 */
export function fastWrite400(field: string, errors: any, res: ServerResponse): void {
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
  res.writeHead(400, [
    'Content-Type', CT_PROBLEM,
    'Content-Length', fastCL(Buffer.byteLength(body)),
  ]);
  res.end(body);
}

/**
 * Write a KozoError as an RFC 7807 problem+json response.
 * Falls back to 500 for unknown errors.
 */
export function fastWriteError(err: unknown, res: ServerResponse): void {
  if (err instanceof KozoError) {
    const body = JSON.stringify({
      type:   `https://kozo-docs.vercel.app/docs/core/errors#${err.code}`,
      title:  err.message,
      status: err.statusCode,
    });
    res.writeHead(err.statusCode, [
      'Content-Type', CT_PROBLEM,
      'Content-Length', fastCL(Buffer.byteLength(body)),
    ]);
    res.end(body);
  } else {
    fastWrite500(res);
  }
}
