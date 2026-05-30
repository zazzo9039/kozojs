import type { z } from 'zod';
import type { Context } from 'hono';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type SchemaType = z.ZodType<any>;

export type RouteSchema = {
  body?: SchemaType;
  query?: SchemaType;
  params?: SchemaType;
  response?: SchemaType | Record<number, SchemaType>;
};

export type InferSchema<T> = T extends z.ZodType<any>
  ? z.infer<T>
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
 * Context object passed to native route handlers (used with `nativeListen`).
 *
 * @deprecated Prefer {@link KozoContext} — the same handler shape works on `listen()`
 * and `nativeListen()` when you use return values or `ctx.json()`. This type remains
 * for direct `buildNativeContext()` / low-level Node.js access.
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

  /** Send a JSON response (default status 200). Uses fast-json-stringify if schema.response is defined. */
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
 * Handler function type for native routes (used with `nativeListen`).
 *
 * @typeParam S    - Route schema
 * @typeParam TSvc - Services shape
 */
/** @deprecated Use {@link KozoHandler} — native routes accept the same handler API. */
export type NativeKozoHandler<
  S extends RouteSchema = {},
  TSvc extends Services = Services,
> = (ctx: NativeKozoContext<S, TSvc>) => void | Promise<void>;

// ============================================
// ROUTE HANDLER TYPES
// ============================================

/**
 * @deprecated Use {@link KozoContext} and {@link KozoHandler} instead. Legacy file-route
 * typing without schema inference; kept for backward compatibility only.
 */
export interface HandlerContext<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery extends Record<string, string> = Record<string, string>
> {
  body: TBody;
  params: TParams;
  query: TQuery;
  headers: Record<string, string>;
  services: Services;
  /** Authenticated user set by JWT middleware */
  user: KozoUser | null;
  c: any; // Raw Hono Context for advanced use cases
}

/** @deprecated Use {@link KozoHandler} instead. */
export type RouteHandler<TBody = unknown> = (
  ctx: HandlerContext<TBody>
) => Promise<unknown> | unknown;

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

export interface RouteModule {
  default: RouteHandler;
  schema?: RouteSchema;
  meta?: RouteMeta;
  middleware?: Array<(ctx: HandlerContext) => Promise<void> | void>;
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

export interface OpenAPIConfigRef {
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
}

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
  port?: number;
  mode?: 'safe' | 'turbo';
  runtime?: 'node' | 'bun';
  target?: 'node' | 'edge' | 'cloudflare' | 'vercel' | 'netlify';
  monitoring?: {
    enable: boolean;
    metrics: ('req/sec' | 'latency' | 'errors')[];
    port?: number;
  };
  basePath?: string;
  openapi?: OpenAPIConfigRef;
  onError?: (error: Error, ctx: any) => any;
  onNotFound?: (ctx: any) => any;

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
}

// ============================================
// DEFINE ROUTE HELPER
// ============================================

export interface RouteDefinitionOptions<TBody = unknown> {
  schema?: RouteSchema;
  meta?: RouteMeta;
  middleware?: Array<(ctx: HandlerContext) => Promise<void> | void>;
  handler: RouteHandler<TBody>;
}

export function defineRoute<TBody = unknown>(
  options: RouteDefinitionOptions<TBody>
): RouteModule {
  return {
    default: options.handler as RouteHandler,
    schema: options.schema,
    meta: options.meta,
    middleware: options.middleware
  };
}
