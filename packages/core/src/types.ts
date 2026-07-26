import type { z } from 'zod';
import type { Context } from 'hono';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type SchemaType = z.ZodType<any>;

export type RouteSchema = {
  body?: SchemaType;
  query?: SchemaType;
  params?: SchemaType;
  headers?: SchemaType;
  response?: SchemaType | Record<number, SchemaType>;
};

export type InferSchema<T> = T extends z.ZodType<any>
  ? z.infer<T>
  : unknown;

/** Infer the values accepted as input by a Zod schema. */
export type InferInput<T> = T extends z.ZodType<any>
  ? z.input<T>
  : unknown;

/**
 * Shorthand for `z.infer<typeof Schema>`.
 *
 * @example
 * const UserSchema = z.object({ name: z.string() });
 * type User = Infer<typeof UserSchema>; // { name: string }
 */
export type Infer<T extends z.ZodType<any>> = z.infer<T>;

/** Infer the response data type from a schema's response field */
export type InferResponse<T> = T extends SchemaType
  ? InferSchema<T>
  : T extends Record<number, SchemaType>
    ? InferSchema<T[200]>
    : unknown;

// ============================================
// REQUEST CONTEXT — typed per-route
// ============================================

/**
 * Typed request object available as `ctx.req`.
 * Provides header access and raw request reference without `any`.
 */
export interface KozoRequest {
  /** Get a request header by name (case-insensitive) */
  header(name: string): string | undefined;
  /** Full request URL string */
  readonly url: string;
  /** HTTP method (GET, POST, …) */
  readonly method: string;
  /** URL path (without query string) */
  readonly path: string;
  /** Raw query string (without leading `?`) */
  readonly query: string;
  /** Read the raw request body as a string (e.g. for webhook signature verification) */
  text(): Promise<string>;
}

/**
 * Typed user payload set by authentication middleware.
 * Extend this interface in your app for full autocompletion:
 *
 * @example
 * declare module '@kozojs/core' {
 *   interface KozoUser {
 *     sub: string;
 *     role: 'admin' | 'user';
 *     email: string;
 *   }
 * }
 */
/**
 * Typed user payload set by authentication middleware.
 *
 * Fields are already included for the most common JWT claims used in Kozo apps.
 * Add extra fields by augmenting this interface in your app:
 *
 * @example
 * declare module '@kozojs/core' {
 *   interface KozoUser {
 *     orgId: string;
 *     plan: 'free' | 'pro';
 *   }
 * }
 */
export interface KozoUser {
  sub?: string;
  /** User primary email address */
  email?: string;
  /** User display name */
  name?: string;
  /** Single role string (most common pattern) */
  role?: string;
  /** Multi-role array (RBAC) */
  roles?: string[];
  /** User UUID / primary key */
  id?: string;
  [key: string]: unknown;
}

/**
 * Context object passed to every Kozo route handler.
 *
 * All fields are fully typed from the route schema — `body`, `query`,
 * `params` have autocompletion based on the Zod schemas you define.
 *
 * @typeParam S         - Route schema (body / query / params / response)
 * @typeParam TServices - Services injected at `createKozo({ services })`
 *
 * @example
 * app.post('/users', { body: CreateUserSchema, response: UserSchema }, (ctx) => {
 *   ctx.body.name    // ✅ string — inferred from CreateUserSchema
 *   ctx.body.email   // ✅ string — inferred from CreateUserSchema
 *   ctx.services.db  // ✅ typed — inferred from createKozo<{ db: DB }>()
 *   ctx.user?.role   // ✅ string | undefined
 *   ctx.req.header('authorization') // ✅ string | undefined
 * });
 */
export type KozoContext<S extends RouteSchema = {}, TServices extends Services = Services> = {
  /** Parsed + validated request body — typed from `schema.body` */
  body: InferSchema<S['body']>;
  /** Parsed + validated query params — typed from `schema.query` */
  query: InferSchema<S['query']>;
  /** Parsed + validated path params — typed from `schema.params` */
  params: InferSchema<S['params']>;
  /** Parsed + validated request headers — typed from `schema.headers` */
  headers: InferSchema<S['headers']>;
  /** Injected services — typed from `createKozo<TServices>()` */
  services: TServices;
  /** Authenticated user set by JWT middleware — extend `KozoUser` for custom fields */
  user: KozoUser | null;
  /** Typed request helper */
  req: KozoRequest;
  /** Send a JSON response. Type is inferred from `schema.response` */
  json(data: InferResponse<S['response']>, status?: number): Response;
  /** Send a plain text response */
  text(data: string, status?: number): Response;
  /** Send an HTML response (e.g. Swagger UI, SSR pages) */
  html(data: string, status?: number): Response;
  /** Redirect to another URL (default 302) */
  redirect(url: string, status?: number): Response;
  /** Set a response header */
  header(name: string, value: string): void;
  /**
   * Raw Hono context — typed escape hatch for cases not covered by the
   * Kozo abstractions (custom headers, streaming, raw request access, etc.).
   */
  c: Context<KozoEnv>;
};

export type KozoHandler<
  S extends RouteSchema = {},
  TServices extends Services = Services,
  TScoped extends Record<string, unknown> = Record<string, never>,
> = (ctx: KozoContext<S, TServices & TScoped>) => any | Promise<any>;

export interface Services {
  [key: string]: unknown;
}

/**
 * App services injected into every route handler (`ctx.services`).
 *
 * Augment once in your app so file-system routes get full autocompletion
 * without a local `defineRoute` wrapper:
 *
 * @example
 * // src/kozo.d.ts
 * import type { AppServices } from './lib/services/index.js';
 * declare module '@kozojs/core' {
 *   interface KozoServices extends AppServices {}
 * }
 */
export interface KozoServices extends Services {}

/** Handler context for file-system routes — uses augmented {@link KozoServices}. */
export type RouteContext<S extends RouteSchema = {}> = KozoContext<S, KozoServices>;

export interface KozoEnv {
  Variables: {
    services: Services;
    user?: KozoUser;
  };
}

// ============================================
// NATIVE CONTEXT — typed context for nativeListen handlers
// ============================================
//
// Provides full TypeScript inference for params, query, body, and response
// while giving developers direct access to Node.js IncomingMessage / ServerResponse.
// This is the "power-user" API for maximum control and performance.
//

/**
 * Advanced context for handlers that need direct Node.js `IncomingMessage` / `ServerResponse`.
 *
 * Most apps should use {@link KozoContext} — the same handler shape works on `listen()`
 * and `nativeListen()` when you use return values or `ctx.json()`. Use this type with
 * {@link buildNativeContext} when you need raw Node.js I/O or uWS-level control.
 *
 * @typeParam S       - Route schema (body, query, params, response)
 * @typeParam TSvc    - Services type (injected at constructor)
 */
export interface NativeKozoContext<
  S extends RouteSchema = {},
  TSvc extends Services = Services,
> {
  /** Raw Node.js incoming request */
  readonly req: IncomingMessage;
  /** Raw Node.js server response */
  readonly res: ServerResponse;
  /** Route parameters — typed from schema.params */
  readonly params: InferSchema<S['params']>;
  /** Parsed query string — typed from schema.query */
  readonly query: InferSchema<S['query']>;
  /** Parsed request body — typed from schema.body */
  readonly body: InferSchema<S['body']>;
  /** Injected services — typed from Kozo<TServices> */
  readonly services: TSvc;

  // ── Response helpers ──────────────────────────────────────────────
  // These write directly to res with optimal cork/uncork batching.

  /** Send a JSON response (default status 200). Uses fast-json-stringify when schema.response is defined. */
  json(data: InferResponse<S['response']>, status?: number): void;
  /** Send a plain text response. */
  text(data: string, status?: number): void;
  /** Send an HTML response (SSR page rendering). */
  html(data: string, status?: number): void;
  /** Set a response header. Returns `this` for chaining. */
  header(name: string, value: string): this;
  /** Redirect to another URL (default 302). */
  redirect(url: string, status?: number): void;
}

/**
 * Handler for advanced native routes that write directly to `ServerResponse`.
 *
 * Prefer {@link KozoHandler} for portable handlers; use this with {@link NativeKozoContext}
 * when you need void-returning handlers and raw Node.js response control.
 *
 * @typeParam S    - Route schema
 * @typeParam TSvc - Services shape
 */
export type NativeKozoHandler<
  S extends RouteSchema = {},
  TSvc extends Services = Services,
> = (ctx: NativeKozoContext<S, TSvc>) => void | Promise<void>;

// ============================================
// ROUTE MODULE TYPES
// ============================================

export interface RouteMeta {
  summary?: string;
  description?: string;
  tags?: string[];
  auth?: boolean;
  rateLimit?: {
    max: number;
    window: number;
  };
}

/** Single default export: `{ schema?, meta?, handler }` (or `defineRoute(...)`). */
export interface RouteDefinitionOptions<
  S extends RouteSchema = RouteSchema,
  TServices extends Services = Services,
> {
  schema?: S;
  meta?: RouteMeta;
  handler: KozoHandler<S, TServices>;
}

export interface RouteModule<S extends RouteSchema = RouteSchema> {
  /** Handler function, or a route definition object with `handler`. */
  default: KozoHandler<S> | RouteDefinitionOptions<S>;
  /** Legacy: schema as a separate export (prefer `default.schema`). */
  schema?: S;
  /** Legacy: meta as a separate export (prefer `default.meta`). */
  meta?: RouteMeta;
}

export interface ResolvedRouteModule<S extends RouteSchema = RouteSchema> {
  handler: KozoHandler<S>;
  schema: S;
  meta?: RouteMeta;
}

// ============================================
// PER-DIRECTORY MIDDLEWARE TYPES
// ============================================

/**
 * A middleware discovered from a `_middleware.ts` file in the routes directory.
 * The `pathPrefix` determines which routes the middleware applies to.
 */
export interface MiddlewareDefinition {
  /** URL path prefix this middleware applies to, e.g. '/admin/*' */
  pathPrefix: string;
  /** The middleware handler function (Hono MiddlewareHandler signature) */
  handler: (c: any, next: () => Promise<void>) => Promise<void | Response> | void | Response;
  /** Absolute path to the source file */
  filePath: string;
}

// ============================================
// ROUTER TYPES
// ============================================

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDefinition {
  path: string;
  method: HttpMethod;
  filePath: string;
  module: RouteModule;
}

// ============================================
// APP CONFIG TYPES
// ============================================

export interface KozoConfig<
  TServices extends Services = Services,
  TScoped extends Record<string, unknown> = Record<string, never>,
> {
  routesDir?: string;
  services?: TServices;
  /**
   * Per-request services merged over {@link services} into `ctx.services`.
   * Runs once per request — use for transactions, correlation IDs, tenant connections.
   * Zero overhead when omitted (singleton-only apps keep the compile-time fast path).
   *
   * @example
   * createKozo({
   *   services: { db: pool },
   *   scopedServices: (base, req) => ({
   *     reqId: req.header('x-request-id') ?? crypto.randomUUID(),
   *   }),
   * });
   */
  scopedServices?: (base: TServices, req: KozoRequest) => TScoped | Promise<TScoped>;
  /**
   * Called after each request when {@link scopedServices} is configured.
   * Receives only the scoped slice (not singletons) — use for commit/rollback/release.
   */
  onRequestEnd?: (scoped: TScoped, error?: Error) => void | Promise<void>;
  /** Max request body size in bytes — requests above this get a 413. Default: 1 MB. */
  maxBodyBytes?: number;
  /** Set to `false` to silence the startup banner (e.g. in tests or benchmarks). Default: true. */
  logger?: boolean;

  /**
   * Custom global error handler (Hono / `listen()` / bridged uWS routes).
   * Return a `Response` to override the default RFC 7807 handling; return
   * `undefined` to fall through to built-in {@link KozoError} / 500 handling.
   */
  onError?: (error: Error, ctx: any) => Response | Promise<Response> | void;

  /**
   * Custom 404 handler (Hono / `listen()` / bridged uWS routes).
   * Return a `Response` to override the default not-found problem detail.
   */
  onNotFound?: (ctx: any) => Response | Promise<Response> | void;

  /**
   * Called after the server starts listening.
   * Use this to initialize connections, warm caches, run migrations, etc.
   *
   * @example
   * createKozo({
   *   services: { db },
   *   onStart: async ({ services }) => {
   *     await services.db.migrate();
   *     console.log('Database migrated');
   *   },
   * });
   */
  onStart?: (ctx: { services: TServices }) => void | Promise<void>;

  /**
   * Called before the server shuts down (after draining in-flight requests).
   * Use this for cleanup: close DB pools, flush queues, release resources.
   *
   * @example
   * createKozo({
   *   services: { db, redis },
   *   onStop: async ({ services }) => {
   *     await services.db.close();
   *     await services.redis.quit();
   *   },
   * });
   */
  onStop?: (ctx: { services: TServices }) => void | Promise<void>;

  /**
   * Allow routes whose response schema cannot be compiled to an enforcing
   * serializer (e.g. `.transform()` or `z.date()` in the response) to start in
   * production. Such routes fall back to unfiltered `JSON.stringify`, so fields
   * not declared in the response schema — `passwordHash`, tokens, internal
   * flags — are sent verbatim. Off by default: in production an uncompilable
   * response schema throws at startup instead of shipping unenforced.
   *
   * Prefer fixing the schema. The name is intentionally alarming.
   */
  dangerouslyAllowUnenforcedResponse?: boolean;
}

// ============================================
// DEFINE ROUTE HELPER
// ============================================

/** Typed helper for `export default defineRoute({ schema, handler, meta? })`. */
export function defineRoute<S extends RouteSchema = RouteSchema>(
  options: RouteDefinitionOptions<S> & { handler: KozoHandler<S, KozoServices> },
): RouteDefinitionOptions<S> {
  return options;
}

/**
 * Returns a `defineRoute` bound to a concrete services type — the explicit
 * alternative to augmenting the global {@link KozoServices} interface
 * (no codegen, no pre-hook scripts, and two apps in the same repo cannot
 * fight over one global interface).
 *
 * Wire it once per app and point a package.json subpath import at it, so
 * every route file imports the same alias regardless of folder depth:
 *
 * @example
 * // package.json
 * // { "imports": { "#kozo": "./src/kozo.ts" } }
 *
 * // src/kozo.ts — the only glue file, written by hand, never regenerated
 * import { createRouteFactory } from '@kozojs/core';
 * import type { AppServices } from './lib/services/index.js';
 * export const { defineRoute } = createRouteFactory<AppServices>();
 *
 * // src/routes/api/users/get.ts
 * import { defineRoute } from '#kozo';
 * export default defineRoute({
 *   handler: ({ services }) => services.users.list(), // fully typed
 * });
 */
export function createRouteFactory<TServices extends Services>() {
  return {
    defineRoute<S extends RouteSchema = RouteSchema>(
      // A plain generic options type (no intersection): the handler context is
      // typed exactly KozoContext<S, TServices>, so passing `ctx.services`
      // around keeps the concrete type instead of degrading to a union.
      options: RouteDefinitionOptions<S, TServices>,
    ): RouteDefinitionOptions<S, TServices> {
      return options;
    },
  };
}
