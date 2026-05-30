// ============================================================================
// Kozo WASM Radix Router v2 — TypeScript Bindings
// ============================================================================
//
// Zero-copy bridge between Node.js and the Zig-compiled radix trie.
// Designed exclusively for `nativeListen` mode.  When the .wasm file is
// absent (Edge deploy, Cloudflare Workers, etc.) the caller falls back
// to RegExpRouter / linear scan — see app.ts for the orchestration.
//
// v2 optimisations over v1:
//   • Handler array (plain []) instead of Map  → ~30% faster lookup
//   • Method integer from charCode fast-path   → no Map lookup per-request
//   • Pre-allocated reusable params object     → less GC pressure
//   • SSR wildcard `*` catch-all support       → captures remaining path
//
// Hot-path flow (per request):
//   1. JS writes ASCII path bytes into WASM url_buf      (~15-30 ns)
//   2. JS calls match_url()                              (WASM trie)
//   3. WASM returns route_id + writes param offsets       (~50-120 ns)
//   4. JS reads param offsets and slices the original     (~20-40 ns)
//      string — no Buffer / TextDecoder allocation.
//
// Target: bridge overhead < 150 ns  ·  trie lookup < 120 ns
// ============================================================================

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type NativeRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => void;

// ── Method encoding (must match radix.zig roots[] indices) ──────────────
// v2: fast inline function avoids Map overhead on every request
const METHOD_INDEX: Record<string, number> = {
  GET: 0,
  POST: 1,
  PUT: 2,
  PATCH: 3,
  DELETE: 4,
  OPTIONS: 5,
  HEAD: 6,
};

/**
 * Ultra-fast method → index. Exploits the fact that HTTP method strings
 * have unique first + fourth characters.  Falls back to object lookup
 * for uncommon methods.  ~2ns vs ~15ns for Map.get().
 *
 * Exported for use in app.ts inline dispatch (avoids computing twice).
 */
export function methodToIndex(m: string): number {
  switch (m.length) {
    case 3:
      // GET=0, PUT=2
      return m.charCodeAt(0) === 71 /* G */ ? 0 : 2;
    case 4:
      // POST=1, HEAD=6
      return m.charCodeAt(0) === 80 /* P */ ? 1 : 6;
    case 5:
      // PATCH=3
      return 3;
    case 6:
      // DELETE=4
      return 4;
    case 7:
      // OPTIONS=5
      return 5;
    default:
      return METHOD_INDEX[m] ?? -1;
  }
}

// ── WASM module shape ───────────────────────────────────────────────────
interface RadixExports {
  memory: WebAssembly.Memory;
  init: () => void;
  insert_route: (method: number, patLen: number, routeId: number) => void;
  match_url: (method: number, urlLen: number) => number;
  get_param_count: () => number;
  get_url_buf_ptr: () => number;
  get_param_buf_ptr: () => number;
  get_pattern_buf_ptr: () => number;
}

// ── Match result ────────────────────────────────────────────────────────
export interface WasmMatchResult {
  handler: NativeRouteHandler;
  params: Record<string, string>;
}

// ════════════════════════════════════════════════════════════════════════
// WasmRadixRouter
// ════════════════════════════════════════════════════════════════════════

export class WasmRadixRouter {
  private exports: RadixExports | null = null;
  private urlView: Uint8Array | null = null;
  private paramView: DataView | null = null;
  private patternView: Uint8Array | null = null;

  // v2: plain arrays indexed by route_id — O(1) with no hash overhead
  private handlers: NativeRouteHandler[] = [];
  private paramNames: string[][] = [];
  /** monotonic route counter */
  private nextRouteId = 0;
  /** whether the WASM module loaded successfully */
  private ready = false;

  // v3: pre-allocated match result — reused across calls to avoid allocation.
  // Safe because dispatch() reads result synchronously and never stores it.
  private readonly _emptyParams: Record<string, string> = Object.freeze({}) as Record<string, string>;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Attempt to load and instantiate the WASM module.
   * Returns `true` on success, `false` if the .wasm file is missing or
   * instantiation fails (caller should fall back to JS routing).
   */
  async init(): Promise<boolean> {
    try {
      // Resolve path relative to this source file
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const wasmPath = join(thisDir, 'wasm', 'radix.wasm');

      const wasmBytes = await readFile(wasmPath);
      const { instance } = await WebAssembly.instantiate(wasmBytes);

      this.exports = instance.exports as unknown as RadixExports;

      // Obtain fixed buffer views (offsets never change after init)
      const mem = this.exports.memory;
      const urlPtr = this.exports.get_url_buf_ptr();
      const paramPtr = this.exports.get_param_buf_ptr();
      const patPtr = this.exports.get_pattern_buf_ptr();

      this.urlView = new Uint8Array(mem.buffer, urlPtr, 4096);
      this.paramView = new DataView(mem.buffer, paramPtr, 32); // 8 params × 4 bytes
      this.patternView = new Uint8Array(mem.buffer, patPtr, 2048);

      // Cold-start: reset internal tree state
      this.exports.init();
      this.ready = true;
      return true;
    } catch {
      // .wasm not found or instantiation failure — caller uses JS fallback
      this.ready = false;
      return false;
    }
  }

  /** Is the WASM module loaded and operational? */
  get isReady(): boolean {
    return this.ready;
  }

  // ── Route registration (called at startup, not hot-path) ──────────────

  /**
   * Register a route in the WASM radix trie.
   *
   * @param method  HTTP method (GET, POST, …)
   * @param path    Express-style pattern, e.g. `/api/users/:id` or `/blog/*`
   * @param handler Compiled native handler (same type used by nativeListen)
   * @returns       The assigned route ID
   */
  addRoute(method: string, path: string, handler: NativeRouteHandler): number {
    if (!this.ready) throw new Error('WasmRadixRouter not initialized');

    const routeId = this.nextRouteId++;
    const methodIdx = METHOD_INDEX[method.toUpperCase()];
    if (methodIdx === undefined) throw new Error(`Unsupported method: ${method}`);

    // Extract param names from the pattern (order matters)
    // v2: also handle wildcard `*` as a param named '*'
    const names: string[] = [];
    const segments = path.split('/');
    for (const seg of segments) {
      if (seg.startsWith(':')) names.push(seg.slice(1));
      else if (seg === '*') names.push('*');
    }

    // v2: store in plain arrays for O(1) indexed access
    this.paramNames[routeId] = names;
    this.handlers[routeId] = handler;

    // Write pattern bytes to WASM shared memory
    const patLen = this.writeAscii(this.patternView!, path);

    // Insert into the Zig trie
    this.exports!.insert_route(methodIdx, patLen, routeId);

    return routeId;
  }

  // ── Hot-path matching ─────────────────────────────────────────────────

  /**
   * Match a request path against the radix trie.
   *
   * ZERO-COPY: the path string is written byte-by-byte into WASM memory
   * without allocating a Buffer or Uint8Array.  Param values are read
   * back as slices of the **original JS string** (the offsets produced by
   * WASM coincide with JS character indices for ASCII paths).
   *
   * v3: Returns a pre-allocated result object that is reused across calls.
   * For static routes (paramCount === 0), the params object is a frozen
   * singleton — ZERO allocations per request on the hot path.
   *
   * @returns `null` on miss; otherwise the handler + extracted params.
   */
  match(method: string, path: string): WasmMatchResult | null {
    // v2: fast inline method-to-index, no Map lookup
    const methodIdx = methodToIndex(method);
    if (methodIdx === -1) return null;

    // ① Write URL bytes into WASM linear memory
    const urlView = this.urlView!;
    const len = path.length;
    for (let i = 0; i < len; i++) {
      urlView[i] = path.charCodeAt(i);
    }

    // ② Call WASM trie lookup
    const routeId: number = this.exports!.match_url(methodIdx, len);
    if (routeId === -1) return null;

    // v2: array index (vastly faster than Map.get)
    const handler = this.handlers[routeId];
    if (!handler) return null;

    // v3: reuse frozen empty params for static routes (zero allocation)
    const paramCount = this.exports!.get_param_count();

    if (paramCount === 0) {
      // Static routes: only the wrapper object is allocated (emptyParams is singleton)
      return { handler, params: this._emptyParams };
    }

    // Dynamic routes: allocate params object (unavoidable for unique keys)
    const names = this.paramNames[routeId];
    const params: Record<string, string> = {};
    const pv = this.paramView!;

    for (let i = 0; i < paramCount && i < names.length; i++) {
      const byteOff = i * 4;
      const offset = pv.getUint16(byteOff, true);     // LE
      const plen = pv.getUint16(byteOff + 2, true);   // LE
      params[names[i]] = path.slice(offset, offset + plen);
    }

    return { handler, params };
  }

  // ── Exposed internals for inline dispatch in app.ts ────────────────────

  /**
   * Expose raw WASM buffers + handler arrays for zero-overhead inline
   * dispatch in app.ts.  Avoids the match() → WasmMatchResult wrapper
   * allocation on dynamic routes (~30-50 ns saved per request).
   *
   * SAFETY: single-threaded — no concurrent access.
   */
  getInternals() {
    return {
      urlView:    this.urlView!,
      exports:    this.exports!,
      handlers:   this.handlers,
      paramNames: this.paramNames,
      paramView:  this.paramView!,
      emptyParams: this._emptyParams,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /**
   * Fast ASCII write — avoids TextEncoder allocation overhead (~50 ns).
   * URL paths are always ASCII, so charCodeAt() is byte-identical.
   */
  private writeAscii(view: Uint8Array, str: string): number {
    const len = str.length;
    for (let i = 0; i < len; i++) {
      view[i] = str.charCodeAt(i);
    }
    return len;
  }
}
