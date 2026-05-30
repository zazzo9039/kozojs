import type { Context } from 'hono';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Services, RouteSchema, KozoRequest } from './types.js';
import type { UwsHttpRes, UwsNativeHandler } from './uws-transport.js';
import { uwsFastWriteJson, uwsFastWriteJsonStatus, uwsFastWrite400, uwsFastWriteError } from './uws-transport.js';
import { fastParseQuery } from './native-context.js';
import { buildNativeContext } from './native-context.js';
import type { AnyScopeConfig } from './scoped-services.js';
import { resolveScopedServices, IncomingReqAdapter, UwsReqAdapter } from './scoped-services.js';
import { z } from 'zod';

// ============================================================================
// Zod-native validator — replaces Ajv (removes eval/URL-string supply chain flags)
//
// API is intentionally Ajv-compatible: callable → boolean, with a mutable
// `.errors` side-channel.
//
// In-place mutation (same as Ajv removeAdditional + coerceTypes):
//   • Extra keys on plain objects are deleted
//   • Coerced/transformed values from Zod overwrite the originals
// Safe in Node.js single-threaded model: no `await` occurs between the
// validator call and the `.errors` read in any scenario.
// ============================================================================
type ZValidatorErrors = { instancePath: string; message: string; keyword?: string; path?: (string | number)[] }[];

interface ZValidateResult {
  valid: boolean;
  errors: ZValidatorErrors | null;
}

type ZValidator = (data: unknown) => ZValidateResult;

const VALID_RESULT: ZValidateResult = Object.freeze({ valid: true, errors: null });

function makeZValidator(schema: z.ZodType): ZValidator {
  return function (data: unknown): ZValidateResult {
    const r = schema.safeParse(data);
    if (r.success) {
      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        const d = data as Record<string, unknown>;
        const rd = r.data as Record<string, unknown>;
        for (const k of Object.keys(d)) if (!(k in rd)) delete d[k];
        Object.assign(d, rd);
      }
      return VALID_RESULT;
    }
    return {
      valid: false,
      errors: r.error.issues.map(i => ({
        instancePath: i.path.length ? '/' + i.path.join('/') : '',
        message: i.message,
        keyword: (i as any).code,
        path: i.path as (string | number)[],
      })),
    };
  };
}
import {
  validationErrorResponse,
  internalErrorResponse,
  internalErrorResponseStatic,
  KozoError,
} from './errors.js';
import {
  fastWriteJson,
  fastWriteError,
  fastWrite400,
  fastWrite500,
} from './fast-response.js';

type CompiledHandler = (c: Context) => Promise<Response> | Response;
type UserHandler = (c: any) => any;

/**
 * Lightweight request adapter — one allocation per request.
 * Methods live on the prototype (shared across all instances),
 * eliminating per-request closure creation.
 */
class HonoReqAdapter {
  /** @internal */ _c: Context;
  constructor(c: Context) { this._c = c; }
  header(name: string)   { return this._c.req.header(name); }
  get url()              { return this._c.req.url; }
  get method()           { return this._c.req.method; }
  get path()             { return this._c.req.path; }
  get query()            { return this._c.req.query('') ?? ''; }
  text()                 { return this._c.req.text(); }
}

/**
 * Prototype for response helper methods.
 * Methods use `this._c` to access the Hono context.
 */
const CTX_PROTO = {
  json(this: any, data: unknown, status?: number) { return this._c.json(data, status); },
  text(this: any, data: string, status?: number)  { return this._c.text(data, status); },
  html(this: any, data: string, status?: number)  { return (this._c as any).html(data, status); },
  redirect(this: any, url: string, status?: number) { return this._c.redirect(url, status); },
  header(this: any, name: string, value: string)  { return this._c.header(name, value); },
};

/**
 * Build the KozoContext object passed to every handler.
 *
 * Response helpers (json, text, html, redirect, header) are bound to the
 * context instance, allowing safe destructuring: `const { json } = ctx`.
 */
function buildCtx(c: Context, extra?: Record<string, unknown>): Record<string, unknown> {
  const ctx = Object.create(CTX_PROTO) as Record<string, unknown>;
  ctx._c = c;
  ctx.c = c;
  ctx.body = undefined;
  ctx.query = undefined;
  ctx.params = undefined;
  ctx.services = undefined;
  ctx.user = (c as any).get?.('user') ?? null;
  ctx.req = new HonoReqAdapter(c);
  // Bind methods to allow destructuring without losing `this` context
  ctx.json = (CTX_PROTO.json as Function).bind(ctx);
  ctx.text = (CTX_PROTO.text as Function).bind(ctx);
  ctx.html = (CTX_PROTO.html as Function).bind(ctx);
  ctx.redirect = (CTX_PROTO.redirect as Function).bind(ctx);
  ctx.header = (CTX_PROTO.header as Function).bind(ctx);
  if (extra) {
    if (extra.body !== undefined) ctx.body = extra.body;
    if (extra.query !== undefined) ctx.query = extra.query;
    if (extra.params !== undefined) ctx.params = extra.params;
    if (extra.services !== undefined) ctx.services = extra.services;
  }
  return ctx;
}

function honoResultToResponse(result: unknown, ser: (data: any) => string): Response {
  if (result instanceof Response) return result;
  return jsonResponse200(ser(result));
}

async function runHonoScoped(
  scope: AnyScopeConfig,
  req: KozoRequest,
  run: (services: Services, signalError: (e: Error) => void) => Promise<Response>,
): Promise<Response> {
  let err: Error | undefined;
  const resolved = await resolveScopedServices(scope, req);
  try {
    return await run(resolved.services, (e) => { err = e; });
  } finally {
    await resolved.finish(err);
  }
}

function finishNativeResult(res: ServerResponse, result: unknown, ser: (data: any) => string): void {
  if (res.writableEnded || res.headersSent) return;
  if (result === undefined) return;
  fastWriteJson(res, ser(result));
}

/** uWS KozoContext shim — same handler API as Hono (return value or ctx.json()). */
function buildUwsHandlerContext(
  uwsRes: UwsHttpRes,
  url: string,
  rawBody: string | undefined,
  params: Record<string, string>,
  body: unknown,
  query: Record<string, string> | undefined,
  services: Services,
  ser: (data: any) => string,
  corsHeaders?: import('./uws-transport.js').CorsHeaders,
): { ctx: Record<string, unknown>; responded: () => boolean } {
  let done = false;
  const ctx: Record<string, unknown> = {
    req: new UwsReqAdapter(url, rawBody),
    body,
    params,
    query,
    services,
    user: null,
    json(data: unknown, status?: number) {
      done = true;
      const body = ser(data);
      if (status !== undefined && status !== 200) uwsFastWriteJsonStatus(uwsRes, body, status, corsHeaders);
      else uwsFastWriteJson(uwsRes, body, corsHeaders);
    },
    text(data: string, status?: number) {
      done = true;
      uwsRes.cork(() => {
        uwsRes.writeStatus(`${status ?? 200}`);
        uwsRes.writeHeader('Content-Type', 'text/plain');
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end(data);
      });
    },
    redirect(target: string, status?: number) {
      done = true;
      uwsRes.cork(() => {
        uwsRes.writeStatus(`${status ?? 302}`);
        uwsRes.writeHeader('Location', target);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end('');
      });
    },
  };
  return { ctx, responded: () => done };
}

function compileScopedRouteHandler(
  handler: UserHandler,
  compiled: CompiledRoute,
  scope: AnyScopeConfig,
): CompiledHandler {
  const { validateBody: vb, validateQuery: vq, validateParams: vp, serialize } = compiled;
  const ser = serialize ?? toJsonBody;

  if (vb) {
    return async function hono_scoped_body(c: Context): Promise<Response> {
      const path = c.req.path;
      const req = new HonoReqAdapter(c);
      try {
        const body = await c.req.json().catch(EMPTY_BODY_HANDLER);
        { const r = vb(body); if (!r.valid) return validationErrorResponse('body', r.errors, path); }
        let query: Record<string, string> | undefined;
        if (vq) { query = c.req.query(); const r = vq(query); if (!r.valid) return validationErrorResponse('query', r.errors, path); }
        let params: Record<string, string> | undefined;
        if (vp) { params = c.req.param() as Record<string, string>; const r = vp(params); if (!r.valid) return validationErrorResponse('params', r.errors, path); }
        return await runHonoScoped(scope, req, async (services, signalError) => {
          try {
            const result = await handler(buildCtx(c, { body, query, params, services }));
            return honoResultToResponse(result, ser);
          } catch (err) {
            signalError(err as Error);
            if (err instanceof KozoError) return err.toResponse(path);
            return internalErrorResponse(err as Error, path);
          }
        });
      } catch (err) {
        if (err instanceof KozoError) return err.toResponse(path);
        return internalErrorResponse(err as Error, path);
      }
    };
  }

  return async function hono_scoped_sync(c: Context): Promise<Response> {
    const path = c.req.path;
    const req = new HonoReqAdapter(c);
    try {
      let query: Record<string, string> | undefined;
      if (vq) { query = c.req.query(); const r = vq(query); if (!r.valid) return validationErrorResponse('query', r.errors, path); }
      let params: Record<string, string> | undefined;
      if (vp) { params = c.req.param() as Record<string, string>; const r = vp(params); if (!r.valid) return validationErrorResponse('params', r.errors, path); }
      return await runHonoScoped(scope, req, async (services, signalError) => {
        try {
          const extra = { query, params, services };
          const result = handler.length === 0 ? (handler as any)() : handler(buildCtx(c, extra));
          if (result != null && typeof (result as any).then === 'function') {
            const r = await result;
            return honoResultToResponse(r, ser);
          }
          return honoResultToResponse(result, ser);
        } catch (err) {
          signalError(err as Error);
          if (err instanceof KozoError) return err.toResponse(path);
          return internalErrorResponse(err as Error, path);
        }
      });
    } catch (err) {
      if (err instanceof KozoError) return err.toResponse(path);
      return internalErrorResponse(err as Error, path);
    }
  };
}

export type NativeRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => void;

export type CompiledRoute = {
  validateBody?: ZValidator;
  validateQuery?: ZValidator;
  validateParams?: ZValidator;
  serialize?: (data: any) => string;
};

function isZodSchema(schema: any): schema is z.ZodType {
  return typeof schema === 'object' && schema !== null && 'safeParse' in schema;
}

// ============================================================================
// Pre-allocated response init objects — frozen so V8 can constant-fold reads
// ============================================================================
function jsonResponse200(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ============================================================================
// Pre-built empty-body handler — captured once, never re-allocated
// ============================================================================
const EMPTY_BODY: Record<string, never> = Object.freeze({}) as Record<string, never>;
const EMPTY_BODY_HANDLER = () => EMPTY_BODY;

// ============================================================================
// Date-aware JSON.stringify replacer — converts Date → ISO 8601 string inline
// during serialization instead of a separate deep recursive pre-walk.
// ============================================================================
function dateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

// ============================================================================
// Fast serializer — skips JSON.stringify for plain strings
// ============================================================================
function toJsonBody(result: any): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result, dateReplacer);
}

export class SchemaCompiler {
  static compile(schema: RouteSchema): CompiledRoute {
    const compiled: CompiledRoute = {};

    // 1. Body — Zod-native validation (no Ajv, no eval)
    if (schema.body && isZodSchema(schema.body)) {
      compiled.validateBody = makeZValidator(schema.body);
    }

    // 2. Query
    if (schema.query && isZodSchema(schema.query)) {
      compiled.validateQuery = makeZValidator(schema.query);
    }

    // 3. Params
    if (schema.params && isZodSchema(schema.params)) {
      compiled.validateParams = makeZValidator(schema.params);
    }

    // 4. Serializer — JSON.stringify with automatic Date → ISO 8601 normalization
    if (schema.response) {
      compiled.serialize = (data: any) => JSON.stringify(data, dateReplacer);
    }

    return compiled;
  }
}

// ============================================================================
// Route Handler Compiler (Hono / Web API transport)
//
// Executed ONCE at startup per route. Builds a closure that captures all
// validators and serializers. Branch checks on closure-captured constants
// (vb, vq, vp, svc) are eliminated by V8 TurboFan after JIT warmup —
// effective runtime performance is identical to hand-written monomorphic
// closures, with ~10× less source code to maintain.
// ============================================================================
export function compileRouteHandler(
  handler: UserHandler,
  schema: RouteSchema,
  services: Services,
  compiled: CompiledRoute,
  scope?: AnyScopeConfig,
): CompiledHandler {
  if (scope?.factory) {
    return compileScopedRouteHandler(handler, compiled, scope);
  }

  const { validateBody: vb, validateQuery: vq, validateParams: vp, serialize } = compiled;
  const svc = services != null && Object.keys(services).length > 0 ? services : undefined;
  const ser = serialize ?? toJsonBody;
  const noArgs = handler.length === 0;

  // Async path — routes that declare a request body must await c.req.json()
  if (vb) {
    return async function hono_body(c: Context): Promise<Response> {
      const path = c.req.path;
      try {
        const body = await c.req.json().catch(EMPTY_BODY_HANDLER);
        { const r = vb(body); if (!r.valid) return validationErrorResponse('body', r.errors, path); }
        let query: Record<string, string> | undefined;
        if (vq) { query = c.req.query(); const r = vq(query); if (!r.valid) return validationErrorResponse('query', r.errors, path); }
        let params: Record<string, string> | undefined;
        if (vp) { params = c.req.param() as Record<string, string>; const r = vp(params); if (!r.valid) return validationErrorResponse('params', r.errors, path); }
        const result = await handler(buildCtx(c, { body, query, params, services: svc }));
        if (result instanceof Response) return result;
        return jsonResponse200(ser(result));
      } catch (err) {
        if (err instanceof KozoError) return err.toResponse(path);
        return internalErrorResponse(err as Error, path);
      }
    };
  }

  // Sync-capable path — no body to await; promise-detect fallback covers
  // async user handlers transparently.
  return function hono_sync(c: Context) {
    try {
      let query: Record<string, string> | undefined;
      if (vq) { query = c.req.query(); const r = vq(query); if (!r.valid) return validationErrorResponse('query', r.errors, c.req.path); }
      let params: Record<string, string> | undefined;
      if (vp) { params = c.req.param() as Record<string, string>; const r = vp(params); if (!r.valid) return validationErrorResponse('params', r.errors, c.req.path); }
      const extra = (query || params || svc) ? { query, params, services: svc } : undefined;
      const result = noArgs ? (handler as any)() : handler(buildCtx(c, extra));
      if (result instanceof Response) return result;
      if (result != null && typeof (result as any).then === 'function') {
        return (result as Promise<any>).then(
          (r: any) => r instanceof Response ? r : jsonResponse200(ser(r)),
          (err: unknown) => err instanceof KozoError
            ? err.toResponse(c.req.path)
            : internalErrorResponse(err as Error, c.req.path),
        );
      }
      return jsonResponse200(ser(result));
    } catch (err) {
      if (err instanceof KozoError) return err.toResponse(c.req.path);
      return internalErrorResponse(err as Error, c.req.path);
    }
  };
}

// ============================================================================
// NATIVE NODE.JS HANDLER COMPILER
//
// Produces (req, res, params) => void handlers that write directly to the
// Node.js ServerResponse socket — no Web API Request/Response allocation.
// Used by Kozo.nativeListen() for maximum throughput.
// ============================================================================

/** Default max request body size: 1MB (aligned with uws-transport). */
export const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;

function readNativeBody(req: IncomingMessage, maxBytes: number = DEFAULT_MAX_BODY_BYTES): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let limitExceeded = false;

    const onData = (chunk: Buffer) => {
      if (limitExceeded) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        limitExceeded = true;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        // Destroy connection to stop receiving data
        req.destroy(new Error(`Request body exceeds ${maxBytes} bytes limit`));
        resolve(null); // Return null to signal limit exceeded
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      try {
        const str = Buffer.concat(chunks).toString('utf8');
        resolve(str ? JSON.parse(str) : {});
      } catch {
        resolve({});
      }
    };
    const onError = (err: Error) => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      reject(err);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

export function compileNativeHandler(
  handler: UserHandler,
  schema: RouteSchema,
  services: Services,
  compiled: CompiledRoute,
  scope?: AnyScopeConfig,
): NativeRouteHandler {
  const { validateBody: vb, validateQuery: vq, validateParams: vp, serialize } = compiled;
  const svc = services != null && Object.keys(services).length > 0 ? services : undefined;
  const ser = serialize ?? toJsonBody;
  const noArgs = handler.length === 0;
  const hasScope = scope?.factory != null;

  async function invokeNative(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
    body: unknown,
    runServices: Services | undefined,
  ): Promise<void> {
    const ctx = buildNativeContext(req, res, params, body, runServices ?? ({} as Services), ser);
    const result = noArgs ? (handler as any)() : handler(ctx);
    if (result != null && typeof (result as any).then === 'function') {
      (result as Promise<any>).then(
        (r: any) => finishNativeResult(res, r, ser),
        (err: unknown) => fastWriteError(err, res),
      );
      return;
    }
    finishNativeResult(res, result, ser);
  }

  // Async path — body requires readNativeBody() await
  if (vb) {
    return async function native_body(req, res, params) {
      try {
        const body = await readNativeBody(req);
        if (body === null) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload Too Large', message: `Request body exceeds maximum allowed size` }));
          return;
        }
        { const r = vb(body); if (!r.valid) { fastWrite400('body', r.errors, res); return; } }
        if (vp) { const r = vp(params); if (!r.valid) { fastWrite400('params', r.errors, res); return; } }
        if (vq) {
          const url = req.url ?? '/';
          const qIdx = url.indexOf('?');
          const query = qIdx === -1 ? {} : fastParseQuery(url.slice(qIdx + 1));
          const r = vq(query);
          if (!r.valid) { fastWrite400('query', r.errors, res); return; }
        }
        if (hasScope && scope) {
          let err: Error | undefined;
          const resolved = await resolveScopedServices(scope, new IncomingReqAdapter(req));
          try {
            await invokeNative(req, res, params, body, resolved.services);
          } catch (e) {
            err = e as Error;
            fastWriteError(err, res);
          } finally {
            await resolved.finish(err);
          }
          return;
        }
        await invokeNative(req, res, params, body, svc);
      } catch (err) { fastWriteError(err, res); }
    };
  }

  // Sync-capable path — no body to read
  return function native_sync(req, res, params) {
    try {
      if (vq) { const url = req.url ?? '/'; const qIdx = url.indexOf('?'); const query = qIdx === -1 ? {} : fastParseQuery(url.slice(qIdx + 1)); const r = vq(query); if (!r.valid) { fastWrite400('query', r.errors, res); return; } }
      if (vp) { const r = vp(params); if (!r.valid) { fastWrite400('params', r.errors, res); return; } }
      if (hasScope && scope) {
        void (async () => {
          let err: Error | undefined;
          const resolved = await resolveScopedServices(scope, new IncomingReqAdapter(req));
          try {
            await invokeNative(req, res, params, undefined, resolved.services);
          } catch (e) {
            err = e as Error;
            fastWriteError(err, res);
          } finally {
            await resolved.finish(err);
          }
        })();
        return;
      }
      void invokeNative(req, res, params, undefined, svc);
    } catch (err) { fastWriteError(err, res); }
  };
}

// ============================================================================
// compileUwsNativeHandler — zero-shim uWS-native handler compiler
//
// Key differences from Node.js native:
//   1. Handler signature: (uwsRes, url, rawBody, params)
//   2. Body parsing: synchronous from pre-buffered rawBody (no await)
//   3. Response writing: uwsFastWriteJson calls uwsRes.cork() directly
// ============================================================================
export function compileUwsNativeHandler(
  handler: UserHandler,
  schema: RouteSchema,
  services: Services,
  compiled: CompiledRoute,
  scope?: AnyScopeConfig,
): UwsNativeHandler {
  const { validateBody: vb, validateQuery: vq, validateParams: vp, serialize } = compiled;
  const svc = services != null && Object.keys(services).length > 0 ? services : undefined;
  const ser = serialize ?? toJsonBody;
  const noArgs = handler.length === 0;
  const hasScope = scope?.factory != null;

  function runUwsHandler(
    uwsRes: UwsHttpRes,
    url: string,
    rawBody: string | undefined,
    params: Record<string, string>,
    body: unknown,
    query: Record<string, string> | undefined,
    runServices: Services | undefined,
    corsHeaders?: import('./uws-transport.js').CorsHeaders,
  ): void {
    const { ctx, responded } = buildUwsHandlerContext(uwsRes, url, rawBody, params, body, query, runServices ?? ({} as Services), ser, corsHeaders);
    const result = noArgs ? (handler as any)() : handler(ctx);
    if (result != null && typeof (result as any).then === 'function') {
      (result as Promise<any>).then(
        (r: any) => { if (!responded()) uwsFastWriteJson(uwsRes, ser(r), corsHeaders); },
        (err: unknown) => uwsFastWriteError(err, uwsRes, corsHeaders),
      );
      return;
    }
    if (!responded()) uwsFastWriteJson(uwsRes, ser(result as any), corsHeaders);
  }

  // Single closure — uWS pre-buffers the body so even body routes are sync
  return function uws_handler(uwsRes: UwsHttpRes, url: string, rawBody: string | undefined, params: Record<string, string>, corsHeaders?: import('./uws-transport.js').CorsHeaders) {
    try {
      let body: any;
      if (vb) {
        // Security: reject oversized bodies
        if (rawBody && rawBody.length > DEFAULT_MAX_BODY_BYTES) {
          uwsRes.cork(() => {
            uwsRes.writeStatus('413 Payload Too Large');
            uwsRes.writeHeader('Content-Type', 'application/json');
            if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
            uwsRes.end(JSON.stringify({ error: 'Payload Too Large', message: `Request body exceeds maximum allowed size` }));
          });
          return;
        }
        try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { body = {}; }
        const r = vb(body); if (!r.valid) { uwsFastWrite400('body', r.errors, uwsRes, corsHeaders); return; }
      }
      let query: Record<string, string> | undefined;
      if (vq) { const qIdx = url.indexOf('?'); query = qIdx === -1 ? {} : fastParseQuery(url.slice(qIdx + 1)); const r = vq(query); if (!r.valid) { uwsFastWrite400('query', r.errors, uwsRes, corsHeaders); return; } }
      if (vp) { const r = vp(params); if (!r.valid) { uwsFastWrite400('params', r.errors, uwsRes, corsHeaders); return; } }

      if (hasScope && scope) {
        void (async () => {
          let err: Error | undefined;
          const resolved = await resolveScopedServices(scope, new UwsReqAdapter(url, rawBody));
          try {
            runUwsHandler(uwsRes, url, rawBody, params, body, query, resolved.services, corsHeaders);
          } catch (e) {
            err = e as Error;
            uwsFastWriteError(err, uwsRes, corsHeaders);
          } finally {
            await resolved.finish(err);
          }
        })();
        return;
      }

      runUwsHandler(uwsRes, url, rawBody, params, body, query, svc, corsHeaders);
    } catch (err) { uwsFastWriteError(err, uwsRes, corsHeaders); }
  };
}
