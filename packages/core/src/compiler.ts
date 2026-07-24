import type { Context } from 'hono';
import type { Services, RouteSchema, KozoRequest } from './types.js';
import type { UwsHttpRes, UwsNativeHandler } from './uws-transport.js';
import { uwsFastWriteJson, uwsFastWriteJsonStatus, uwsFastWrite400, uwsFastWriteError, canWriteUws, uwsCorkRespond, uwsSafeEnd } from './uws-transport.js';
import { fastParseQuery } from './native-context.js';
import type { AnyScopeConfig } from './scoped-services.js';
import { resolveScopedServices, UwsReqAdapter } from './scoped-services.js';
import { z } from 'zod';
import { compileResponseSerializerWithMeta, toJsonBody } from './response-serializer.js';

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
      if (data !== null && typeof data === 'object') {
        if (Array.isArray(data)) {
          // Array body (e.g. `body: z.array(...)`): coercions/transforms produce
          // a NEW array, so rewrite the caller's array in place — otherwise the
          // handler would receive the original, untransformed values.
          const rd = r.data as unknown[];
          const arr = data as unknown[];
          arr.length = 0;
          for (let i = 0; i < rd.length; i++) arr.push(rd[i]);
        } else {
          // Object body: strip extra keys (removeAdditional) and write coerced
          // values back in place (coerceTypes parity with the old Ajv path).
          const d = data as Record<string, unknown>;
          const rd = r.data as Record<string, unknown>;
          for (const k of Object.keys(d)) if (!(k in rd)) delete d[k];
          Object.assign(d, rd);
        }
      }
      // NOTE: a primitive-root body (`body: z.string().transform(...)`) cannot be
      // rewritten in place; such transforms are not reflected in ctx.body.
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
  bodyTooLargeJson,
} from './errors.js';

/** Optional per-app error hook from {@link KozoConfig.onError}. */
export type KozoErrorHook = (error: Error, ctx: unknown) => Response | Promise<Response> | void;

async function resolveHandlerError(
  err: unknown,
  path: string,
  ctx: unknown,
  hook?: KozoErrorHook,
): Promise<Response> {
  if (hook && err instanceof Error) {
    try {
      const custom = hook(err, ctx);
      if (custom instanceof Response) return custom;
      if (custom != null && typeof (custom as Promise<Response>).then === 'function') {
        return await (custom as Promise<Response>);
      }
    } catch (hookErr) {
      console.error('[Kozo] onError hook failed:', hookErr);
    }
  }
  if (err instanceof KozoError) return err.toResponse(path);
  return internalErrorResponse(err as Error, path);
}

function resolveHandlerErrorSync(err: unknown, path: string, ctx: unknown, hook?: KozoErrorHook): Response {
  if (hook && err instanceof Error) {
    try {
      const custom = hook(err, ctx);
      if (custom instanceof Response) return custom;
    } catch (hookErr) {
      console.error('[Kozo] onError hook failed:', hookErr);
    }
  }
  if (err instanceof KozoError) return err.toResponse(path);
  return internalErrorResponse(err as Error, path);
}

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
 * Marker set on the Hono context the first time a handler calls ctx.header().
 * When set, return-value serialization routes the body through Hono's response
 * builder (c.body) so the pending headers are applied — a raw new Response()
 * would silently drop them.
 */
const HONO_HEADERS_DIRTY = Symbol('kozoHonoHeadersDirty');

/**
 * Prototype for response helper methods.
 * Methods use `this._c` to access the Hono context.
 */
const CTX_PROTO = {
  json(this: any, data: unknown, status?: number) { return this._c.json(data, status); },
  text(this: any, data: string, status?: number)  { return this._c.text(data, status); },
  html(this: any, data: string, status?: number)  { return (this._c as any).html(data, status); },
  redirect(this: any, url: string, status?: number) { return this._c.redirect(url, status); },
  header(this: any, name: string, value: string)  {
    this._c[HONO_HEADERS_DIRTY] = true;
    return this._c.header(name, value);
  },
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

function honoResultToResponse(c: Context, result: unknown, ser: (data: any) => string): Response {
  if (result instanceof Response) return result;
  const body = ser(result);
  // Apply any headers the handler set via ctx.header(); a raw new Response()
  // drops them, so route the body through Hono's builder only when needed.
  if ((c as any)[HONO_HEADERS_DIRTY]) return c.body(body, 200, { 'Content-Type': 'application/json' });
  return jsonResponse200(body);
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

type CompiledHandler = (c: Context) => Promise<Response> | Response;
type UserHandler = (c: any) => any;

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
  method: string,
  remoteAddress: string,
  corsHeaders?: import('./uws-transport.js').CorsHeaders,
  reqHeaders?: Record<string, string>,
  user?: unknown,
): { ctx: Record<string, unknown>; responded: () => boolean; finalCors: () => import('./uws-transport.js').CorsHeaders | undefined } {
  let done = false;
  // Headers the handler set via ctx.header(). Merged after the CORS headers so
  // they are written on every response path, including the auto-serialized
  // return value (see runUwsHandler). Undefined until the first header() call
  // keeps the common no-header path allocation-free.
  let userHeaders: [string, string][] | undefined;
  const finalCors = (): import('./uws-transport.js').CorsHeaders | undefined => {
    if (!userHeaders) return corsHeaders;
    return corsHeaders ? [...corsHeaders, ...userHeaders] : userHeaders;
  };
  const ctx: Record<string, unknown> = {
    req: new UwsReqAdapter(url, method, rawBody, reqHeaders ?? {}, remoteAddress),
    body,
    params,
    query,
    services,
    user: user ?? null,
    header(name: string, value: string) {
      (userHeaders ??= []).push([name, value]);
    },
    json(data: unknown, status?: number) {
      done = true;
      const body = ser(data);
      const ch = finalCors();
      if (status !== undefined && status !== 200) uwsFastWriteJsonStatus(uwsRes, body, status, ch);
      else uwsFastWriteJson(uwsRes, body, ch);
    },
    text(data: string, status?: number) {
      done = true;
      if (!canWriteUws(uwsRes)) return;
      const ch = finalCors();
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${status ?? 200}`);
        uwsRes.writeHeader('Content-Type', 'text/plain');
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, data);
      });
    },
    html(data: string, status?: number) {
      done = true;
      if (!canWriteUws(uwsRes)) return;
      const ch = finalCors();
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${status ?? 200}`);
        uwsRes.writeHeader('Content-Type', 'text/html; charset=utf-8');
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, data);
      });
    },
    redirect(target: string, status?: number) {
      done = true;
      if (!canWriteUws(uwsRes)) return;
      const ch = finalCors();
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${status ?? 302}`);
        uwsRes.writeHeader('Location', target);
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, '');
      });
    },
  };
  return { ctx, responded: () => done, finalCors };
}

function compileScopedRouteHandler(
  handler: UserHandler,
  compiled: CompiledRoute,
  scope: AnyScopeConfig,
  errorHook?: KozoErrorHook,
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
            return honoResultToResponse(c, result, ser);
          } catch (err) {
            signalError(err as Error);
            return resolveHandlerErrorSync(err, path, c, errorHook);
          }
        });
      } catch (err) {
        return resolveHandlerErrorSync(err, path, c, errorHook);
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
            return honoResultToResponse(c, r, ser);
          }
          return honoResultToResponse(c, result, ser);
        } catch (err) {
          signalError(err as Error);
          return resolveHandlerErrorSync(err, path, c, errorHook);
        }
      });
    } catch (err) {
      return resolveHandlerErrorSync(err, path, c, errorHook);
    }
  };
}

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

/** Options controlling diagnostics for {@link SchemaCompiler.compile}. */
export interface CompileOptions {
  /** Human-readable route label for diagnostics, e.g. `"GET /api/users"`. */
  route?: string;
  /**
   * Register a route whose response schema could **not** be compiled to an
   * enforcing serializer. The response contract is NOT enforced for such a
   * route: fields not declared in the schema (passwordHash, tokens, internal
   * flags) are serialized verbatim. Off by default. In production an
   * uncompilable response schema throws at startup unless this is set.
   *
   * The name is deliberately alarming — reaching for it in a review should
   * prompt the question "why can this route not describe its own response?".
   */
  dangerouslyAllowUnenforcedResponse?: boolean;
}

/**
 * Report a response schema that fell back to unfiltered serialization because
 * it could not be compiled. Warns in development; throws at startup in
 * production so an unenforced response contract cannot ship unnoticed. The
 * `dangerouslyAllowUnenforcedResponse` escape hatch downgrades the throw to a
 * warning even in production.
 */
export function reportUnsafeResponseFallback(
  reason: string,
  opts: CompileOptions,
): void {
  const where = opts.route ? ` for ${opts.route}` : '';
  const msg =
    `[Kozo] Response schema${where} could not be compiled to an enforcing serializer — ` +
    `falling back to JSON.stringify WITHOUT field filtering. Fields not declared in the ` +
    `response schema (e.g. passwordHash, tokens, internal flags) will be included in ` +
    `responses. Cause: ${reason}`;

  if (process.env.NODE_ENV === 'production' && !opts.dangerouslyAllowUnenforcedResponse) {
    throw new Error(
      `${msg}\nRefusing to start: fix the response schema, or pass ` +
      `dangerouslyAllowUnenforcedResponse to ship it unenforced.`,
    );
  }
  console.warn(msg);
}

export class SchemaCompiler {
  static compile(schema: RouteSchema, opts: CompileOptions = {}): CompiledRoute {
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

    // 4. Serializer — fast-json-stringify from Zod response schema. A schema
    //    that cannot be compiled falls back to JSON.stringify; that fallback is
    //    reported (warn in dev, throw in prod) so it is never silent — see F-11.
    if (schema.response) {
      const meta = compileResponseSerializerWithMeta(schema.response);
      if (meta) {
        compiled.serialize = meta.serialize;
        if (meta.unsafeFallback) {
          reportUnsafeResponseFallback(meta.unsafeFallback.reason, opts);
        }
      }
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
  errorHook?: KozoErrorHook,
): CompiledHandler {
  if (scope?.factory) {
    return compileScopedRouteHandler(handler, compiled, scope, errorHook);
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
        return honoResultToResponse(c, result, ser);
      } catch (err) {
        return await resolveHandlerError(err, path, c, errorHook);
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
          (r: any) => honoResultToResponse(c, r, ser),
          (err: unknown) => resolveHandlerErrorSync(err, c.req.path, c, errorHook),
        );
      }
      return honoResultToResponse(c, result, ser);
    } catch (err) {
      return resolveHandlerErrorSync(err, c.req.path, c, errorHook);
    }
  };
}

/** Default max request body size: 1MB (aligned with uws-transport). */
export const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;

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
  maxBodyBytes: number = DEFAULT_MAX_BODY_BYTES,
  method: string = 'GET',
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
    reqHeaders?: Record<string, string>,
    remoteAddress = '',
    user?: unknown,
  ): void {
    const { ctx, responded, finalCors } = buildUwsHandlerContext(
      uwsRes, url, rawBody, params, body, query, runServices ?? ({} as Services), ser, method, remoteAddress, corsHeaders, reqHeaders, user,
    );
    const result = noArgs ? (handler as any)() : handler(ctx);
    if (result != null && typeof (result as any).then === 'function') {
      (result as Promise<any>).then(
        (r: any) => {
          if (!canWriteUws(uwsRes)) return;
          try {
            if (!responded()) uwsFastWriteJson(uwsRes, ser(r), finalCors());
          } catch (err) {
            uwsFastWriteError(err, uwsRes, corsHeaders);
          }
        },
        (err: unknown) => {
          if (canWriteUws(uwsRes)) uwsFastWriteError(err, uwsRes, corsHeaders);
        },
      );
      return;
    }
    if (!responded() && canWriteUws(uwsRes)) uwsFastWriteJson(uwsRes, ser(result as any), finalCors());
  }

  // Single closure — uWS pre-buffers the body so even body routes are sync
  return function uws_handler(uwsRes: UwsHttpRes, url: string, rawBody: string | undefined, params: Record<string, string>, corsHeaders?: import('./uws-transport.js').CorsHeaders, reqHeaders?: Record<string, string>, remoteAddress = '', user?: unknown) {
    try {
      let body: any;
      if (vb) {
        // Security: reject oversized bodies
        if (rawBody && rawBody.length > maxBodyBytes) {
          uwsCorkRespond(uwsRes, () => {
            uwsRes.writeStatus('413 Payload Too Large');
            uwsRes.writeHeader('Content-Type', 'application/problem+json');
            if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
            uwsSafeEnd(uwsRes, bodyTooLargeJson(maxBodyBytes));
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
          const resolved = await resolveScopedServices(scope, new UwsReqAdapter(url, method, rawBody, reqHeaders ?? {}, remoteAddress));
          try {
            runUwsHandler(uwsRes, url, rawBody, params, body, query, resolved.services, corsHeaders, reqHeaders, remoteAddress, user);
          } catch (e) {
            err = e as Error;
            if (canWriteUws(uwsRes)) uwsFastWriteError(err, uwsRes, corsHeaders);
          } finally {
            await resolved.finish(err);
          }
        })();
        return;
      }

      runUwsHandler(uwsRes, url, rawBody, params, body, query, svc, corsHeaders, reqHeaders, remoteAddress, user);
    } catch (err) { if (canWriteUws(uwsRes)) uwsFastWriteError(err, uwsRes, corsHeaders); }
  };
}
