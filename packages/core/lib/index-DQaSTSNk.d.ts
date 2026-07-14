import * as hono from 'hono';
import { Context, MiddlewareHandler, Next, Hono } from 'hono';
import { z } from 'zod';
import { IncomingMessage, ServerResponse } from 'node:http';

type SchemaType = z.ZodType<any>;
type RouteSchema = {
    body?: SchemaType;
    query?: SchemaType;
    params?: SchemaType;
    response?: SchemaType | Record<number, SchemaType>;
};
type InferSchema<T> = T extends z.ZodType<any> ? z.infer<T> : unknown;
/**
 * Shorthand for `z.infer<typeof Schema>`.
 *
 * @example
 * const UserSchema = z.object({ name: z.string() });
 * type User = Infer<typeof UserSchema>; // { name: string }
 */
type Infer<T extends z.ZodType<any>> = z.infer<T>;
/** Infer the response data type from a schema's response field */
type InferResponse<T> = T extends SchemaType ? InferSchema<T> : T extends Record<number, SchemaType> ? InferSchema<T[200]> : unknown;
/**
 * Typed request object available as `ctx.req`.
 * Provides header access and raw request reference without `any`.
 */
interface KozoRequest {
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
interface KozoUser {
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
type KozoContext<S extends RouteSchema = {}, TServices extends Services = Services> = {
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
type KozoHandler<S extends RouteSchema = {}, TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>> = (ctx: KozoContext<S, TServices & TScoped>) => any | Promise<any>;
interface Services {
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
interface KozoServices extends Services {
}
/** Handler context for file-system routes — uses augmented {@link KozoServices}. */
type RouteContext<S extends RouteSchema = {}> = KozoContext<S, KozoServices>;
interface KozoEnv {
    Variables: {
        services: Services;
        user?: KozoUser;
    };
}
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
interface NativeKozoContext<S extends RouteSchema = {}, TSvc extends Services = Services> {
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
type NativeKozoHandler<S extends RouteSchema = {}, TSvc extends Services = Services> = (ctx: NativeKozoContext<S, TSvc>) => void | Promise<void>;
interface RouteMeta {
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
interface RouteDefinitionOptions<S extends RouteSchema = RouteSchema, TServices extends Services = Services> {
    schema?: S;
    meta?: RouteMeta;
    handler: KozoHandler<S, TServices>;
}
interface RouteModule<S extends RouteSchema = RouteSchema> {
    /** Handler function, or a route definition object with `handler`. */
    default: KozoHandler<S> | RouteDefinitionOptions<S>;
    /** Legacy: schema as a separate export (prefer `default.schema`). */
    schema?: S;
    /** Legacy: meta as a separate export (prefer `default.meta`). */
    meta?: RouteMeta;
}
interface ResolvedRouteModule<S extends RouteSchema = RouteSchema> {
    handler: KozoHandler<S>;
    schema: S;
    meta?: RouteMeta;
}
/**
 * A middleware discovered from a `_middleware.ts` file in the routes directory.
 * The `pathPrefix` determines which routes the middleware applies to.
 */
interface MiddlewareDefinition {
    /** URL path prefix this middleware applies to, e.g. '/admin/*' */
    pathPrefix: string;
    /** The middleware handler function (Hono MiddlewareHandler signature) */
    handler: (c: any, next: () => Promise<void>) => Promise<void | Response> | void | Response;
    /** Absolute path to the source file */
    filePath: string;
}
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface RouteDefinition {
    path: string;
    method: HttpMethod;
    filePath: string;
    module: RouteModule;
}
interface KozoConfig<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>> {
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
    onStart?: (ctx: {
        services: TServices;
    }) => void | Promise<void>;
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
    onStop?: (ctx: {
        services: TServices;
    }) => void | Promise<void>;
}
/** Typed helper for `export default defineRoute({ schema, handler, meta? })`. */
declare function defineRoute<S extends RouteSchema = RouteSchema>(options: RouteDefinitionOptions<S> & {
    handler: KozoHandler<S, KozoServices>;
}): RouteDefinitionOptions<S>;
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
declare function createRouteFactory<TServices extends Services>(): {
    defineRoute<S extends RouteSchema = RouteSchema>(options: RouteDefinitionOptions<S, TServices>): RouteDefinitionOptions<S, TServices>;
};

/**
 * Minimal transport-agnostic request view passed to guards.
 * Built from pre-collected data on the uWS path (zero extra I/O) and from the
 * Hono context under `listen()`.
 */
interface GuardRequest {
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
interface GuardDeny {
    status: number;
    /** JSON-serializable body. Defaults to `{ title, status }`. */
    body?: unknown;
    /** Extra response headers on the denial (e.g. Retry-After). */
    headers?: Record<string, string>;
}
/** What a guard may return. `void`/`null`/`undefined` ⇒ pass. */
interface GuardOutcome {
    /** Present ⇒ reject the request with this response. */
    deny?: GuardDeny;
    /** Attach the authenticated user (visible to later guards and `ctx.user`). */
    user?: unknown;
    /** Response headers to add when the request is allowed. */
    headers?: Record<string, string>;
}
type GuardResult = void | null | undefined | GuardOutcome;
/** A transport-agnostic guard function. May be sync or async. */
type KozoGuard = (req: GuardRequest) => GuardResult | Promise<GuardResult>;
/** A guard registered on the app, with its path pattern. */
interface GuardEntry {
    pattern: string;
    guard: KozoGuard;
}
/**
 * Compile a middleware-style pattern ('/api/*', '/users/:id', '*') into a
 * RegExp matched against the request pathname. Used on the native path so a
 * guard registered on '/api/users/:id' does not run for '/api/posts/1' even
 * when both routes were conservatively associated at startup.
 */
declare function compileGuardPattern(pattern: string): RegExp;
/**
 * Wrap a guard as a Hono middleware so `listen()` (and bridged routes under
 * `nativeListen()`) enforce exactly the same checks as the native path.
 */
declare function guardToHonoMiddleware(guard: KozoGuard): MiddlewareHandler<KozoEnv>;

interface LoggerOptions {
    prefix?: string;
    colorize?: boolean;
}
/**
 * Request logger middleware
 */
declare function logger(options?: LoggerOptions): (c: Context, next: Next) => Promise<void>;

interface CorsOptions {
    origin?: string | string[] | ((origin: string) => string | undefined | null);
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    maxAge?: number;
    credentials?: boolean;
}
/**
 * CORS middleware wrapper
 */
declare function cors(options?: CorsOptions): hono.MiddlewareHandler;

interface RateLimitStoreRecord {
    count: number;
    resetAt: number;
}
/** Pluggable store for rate-limit state (e.g. @kozojs/redis rateLimit store). */
interface RateLimitStore {
    increment(key: string, windowMs: number): Promise<RateLimitStoreRecord>;
    reset(key: string): Promise<void>;
}
interface RateLimitOptions {
    max: number;
    window: number;
    keyGenerator?: (c: Context) => string;
    message?: string;
    /** External store (Redis, etc.). Falls back to in-memory Map when omitted. */
    store?: RateLimitStore;
}
/**
 * Rate limiting middleware.
 * Pass `store` for distributed rate limiting (e.g. @kozojs/redis).
 */
declare function rateLimit(options: RateLimitOptions): (c: Context, next: Next) => Promise<(Response & hono.TypedResponse<{
    error: string;
}, 429, "json">) | undefined>;
interface RateLimitGuardOptions {
    max: number;
    window: number;
    keyGenerator?: (req: GuardRequest) => string;
    message?: string;
    /** External store (Redis, etc.). Falls back to in-memory Map when omitted. */
    store?: RateLimitStore;
}
/**
 * Rate limiting as a guard for `app.guard()` — same semantics and store as
 * the `rateLimit` middleware (X-RateLimit-* headers, 429 on excess), but it
 * runs on the uWS native fast path instead of forcing the Hono bridge.
 *
 * @example
 * app.guard('/api/auth/login', rateLimitGuard({ max: 20, window: 900 }));
 */
declare function rateLimitGuard(options: RateLimitGuardOptions): KozoGuard;
/**
 * Clear in-memory rate limit store (for testing)
 */
declare function clearRateLimitStore(): void;

/**
 * Global error handler middleware.
 * Catches KozoError instances and returns RFC 7807 problem+json responses.
 */
declare function errorHandler(): (c: Context, next: Next) => Promise<Response | undefined>;

type ManifestHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
/**
 * A single route entry as written to routes-manifest.json
 */
interface ManifestRoute {
    /** URL path, e.g. /users/:id */
    path: string;
    /** HTTP method (lowercase) */
    method: ManifestHttpMethod;
    /** Absolute or project-relative path to the handler file */
    handler: string;
    /** Named URL params extracted from the path, e.g. ['id'] */
    params: string[];
    /** Whether the handler module exports a body schema */
    hasBodySchema: boolean;
    /** Whether the handler module exports a query schema */
    hasQuerySchema: boolean;
}
/**
 * The shape of routes-manifest.json
 */
interface RoutesManifest {
    version: number;
    generatedAt: string;
    routes: ManifestRoute[];
}
interface FileSystemRoutingOptions {
    /**
     * Path to the routes-manifest.json file.
     * Defaults to `./routes-manifest.json` relative to cwd.
     */
    manifestPath?: string;
    /**
     * If true, log registered routes to stdout.
     * @default false
     */
    verbose?: boolean;
    /**
     * Called when the manifest is missing or unreadable.
     * Defaults to a silent no-op (backward-compatible behaviour).
     */
    onMissingManifest?: (reason: Error) => void;
    /**
     * Custom log function used when `verbose` is true.
     * Defaults to `console.log`.
     */
    logger?: (...args: unknown[]) => void;
}
/**
 * Register all routes declared in `routes-manifest.json` onto a Hono app.
 *
 * This function is **not** a Hono middleware in the classical sense — it is an
 * *async initializer* that must be awaited before the server starts accepting
 * requests. Calling it early (before user-defined routes) guarantees that
 * manifest routes take precedence.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { applyFileSystemRouting } from '@kozojs/core/middleware';
 *
 * const app = new Hono();
 * await applyFileSystemRouting(app, { manifestPath: './routes-manifest.json' });
 *
 * // User-defined routes registered AFTER are appended normally
 * app.get('/health', c => c.json({ ok: true }));
 * ```
 */
declare function applyFileSystemRouting(app: Hono<any>, options?: FileSystemRoutingOptions): Promise<void>;
/**
 * Alternative factory that returns an async function you can call with a Hono
 * app. Useful when you want to pre-configure options and apply them later.
 *
 * @example
 * ```ts
 * const fsr = createFileSystemRouting({ verbose: true });
 * await fsr(app);
 * ```
 */
declare function createFileSystemRouting(options?: FileSystemRoutingOptions): (app: Hono<any>) => Promise<void>;

interface WebhookVerifyOptions {
    /** Shared secret used to compute the HMAC digest. */
    secret: string;
    /**
     * HMAC algorithm. Defaults to `'sha256'`.
     * Any algorithm accepted by `crypto.createHmac()` is valid (e.g. `'sha512'`).
     */
    algorithm?: string;
    /**
     * Name of the HTTP header that carries the signature.
     * Defaults to `'x-webhook-signature'`.
     * The expected format is `sha256=<hex-digest>` (matching GitHub-style webhooks).
     */
    headerName?: string;
}
/**
 * Middleware that verifies the HMAC signature of an incoming webhook request.
 *
 * - Returns **401** when the signature header is missing.
 * - Returns **403** when the signature does not match (uses `timingSafeEqual`
 *   to prevent timing attacks).
 * - Calls `next()` when the signature is valid.
 *
 * @example
 * app.middleware('/webhooks/*',
 *   verifyWebhookSignature({ secret: process.env.WEBHOOK_SECRET! })
 * );
 */
declare function verifyWebhookSignature(options: WebhookVerifyOptions): (c: Context, next: Next) => Promise<Response | void>;

export { rateLimit as A, rateLimitGuard as B, type CorsOptions as C, clearRateLimitStore as D, type RateLimitOptions as E, type RateLimitGuardOptions as F, type GuardRequest as G, type HttpMethod as H, type InferSchema as I, type RateLimitStore as J, type KozoConfig as K, type LoggerOptions as L, type MiddlewareDefinition as M, type NativeKozoContext as N, type RateLimitStoreRecord as O, errorHandler as P, applyFileSystemRouting as Q, type RouteSchema as R, type Services as S, createFileSystemRouting as T, type FileSystemRoutingOptions as U, type ManifestRoute as V, type ManifestHttpMethod as W, type RoutesManifest as X, verifyWebhookSignature as Y, type WebhookVerifyOptions as Z, type KozoHandler as a, type RouteMeta as b, type KozoEnv as c, type KozoGuard as d, type KozoRequest as e, type RouteDefinition as f, type RouteModule as g, type ResolvedRouteModule as h, type RouteDefinitionOptions as i, type KozoContext as j, type KozoUser as k, type KozoServices as l, type RouteContext as m, type NativeKozoHandler as n, type InferResponse as o, type Infer as p, defineRoute as q, createRouteFactory as r, guardToHonoMiddleware as s, compileGuardPattern as t, type GuardResult as u, type GuardOutcome as v, type GuardDeny as w, type GuardEntry as x, logger as y, cors as z };
