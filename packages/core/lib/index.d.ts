import * as hono from 'hono';
import { MiddlewareHandler, Context } from 'hono';
import { Hono } from 'hono/quick';
import { Server, IncomingMessage, ServerResponse } from 'node:http';
import { R as RouteSchema, H as HttpMethod$1, S as Services, K as KozoHandler, a as RouteMeta, b as KozoConfig, c as KozoEnv, d as KozoGuard, e as KozoRequest, N as NativeKozoContext, f as RouteDefinition, M as MiddlewareDefinition, g as RouteModule, h as ResolvedRouteModule } from './index-BNjGbSIL.js';
export { C as ClientAddressSource, E as CorsOptions, Z as FileSystemRoutingOptions, y as GuardDeny, z as GuardEntry, x as GuardOutcome, G as GuardRequest, w as GuardResult, q as Infer, o as InferInput, p as InferResponse, I as InferSchema, j as KozoContext, l as KozoServices, k as KozoUser, L as LoggerOptions, $ as ManifestHttpMethod, _ as ManifestRoute, n as NativeKozoHandler, Q as RateLimitGuardOptions, P as RateLimitOptions, U as RateLimitStore, V as RateLimitStoreRecord, m as RouteContext, i as RouteDefinitionOptions, a0 as RoutesManifest, r as SchemaType, T as TrustProxy, a2 as WebhookVerifyOptions, X as applyFileSystemRouting, O as clearRateLimitStore, v as compileGuardPattern, D as cors, Y as createFileSystemRouting, t as createRouteFactory, s as defineRoute, W as errorHandler, u as guardToHonoMiddleware, B as logger, F as rateLimit, J as rateLimitGuard, A as resolveClientIp, a1 as verifyWebhookSignature } from './index-BNjGbSIL.js';
import { Writable } from 'node:stream';
import { z } from 'zod';
export { z } from 'zod';

/**
 * Client Generator Options
 */
interface ClientGeneratorOptions {
    /** Include Zod schemas for client-side validation (default: true) */
    includeValidation?: boolean;
    /** Base URL for the API (default: '') */
    baseUrl?: string;
    /** Enable runtime validation by default (default: false) */
    validateByDefault?: boolean;
    /** Custom headers to include in all requests */
    defaultHeaders?: Record<string, string>;
}
/**
 * Route information for client generation
 */
interface RouteInfo {
    method: string;
    path: string;
    schema: RouteSchema;
    /** Optional: store the Zod schema instance for type extraction */
    zodSchemas?: {
        body?: any;
        query?: any;
        params?: any;
        headers?: any;
        response?: any;
    };
}
/**
 * Generate typed client code from routes
 */
declare function generateTypedClient(routes: RouteInfo[], options?: ClientGeneratorOptions): string;

type DatabaseProvider = 'postgresql' | 'mysql' | 'sqlite';
type DatabaseInstance = Record<string, unknown>;
/**
 * Shutdown configuration options
 */
interface ShutdownOptions {
    /** Maximum time to wait for in-flight requests to complete (default: 30000ms) */
    timeoutMs?: number;
    /** Callback fired when shutdown starts */
    onShutdownStart?: (inflightCount: number) => void;
    /** Callback fired when all requests complete before timeout */
    onShutdownComplete?: () => void;
    /** Callback fired when shutdown times out */
    onShutdownTimeout?: (remainingInflight: number) => void;
    /** Database instance to close (optional) */
    database?: DatabaseInstance;
    /** Database provider type (required if database is provided) */
    databaseProvider?: DatabaseProvider;
}
/**
 * Internal state for tracking in-flight requests
 */
interface InflightTracker {
    count: number;
    requests: Set<Promise<unknown>>;
}
/**
 * Create an in-flight request tracker
 */
declare function createInflightTracker(): InflightTracker;
/**
 * Track a request - call at the start of each request
 */
declare function trackRequest(tracker: InflightTracker): () => void;
/**
 * Shutdown state machine
 */
type ShutdownState = 'running' | 'shutting-down' | 'shutdown';
/**
 * Graceful shutdown manager
 */
declare class ShutdownManager {
    private state;
    private abortController;
    private server;
    private tracker;
    private database;
    private databaseProvider;
    private cleanupHooks;
    private shutdownStartCallbacks;
    private countDrainResolve;
    constructor();
    /**
     * Register a callback to be called when shutdown starts
     */
    onShutdownStart(callback: () => void): void;
    /**
     * Get current shutdown state
     */
    getState(): ShutdownState;
    /**
     * Check if server is shutting down
     */
    isShuttingDown(): boolean;
    /**
     * Get current in-flight request count
     */
    getInflightCount(): number;
    /**
     * Set the server instance for shutdown
     */
    setServer(server: Server): void;
    /**
     * Set database for cleanup
     */
    setDatabase(db: DatabaseInstance, provider: DatabaseProvider): void;
    /**
     * Get the AbortController signal for request cancellation
     */
    getAbortSignal(): AbortSignal | undefined;
    /**
     * Create a request tracker middleware
     * Returns an untrack function to call when request completes
     * Lazy allocation: only creates Promise when shutting down
     */
    trackRequest(): () => void;
    /**
     * Register a cleanup callback to run during shutdown (after draining requests, before closing DB).
     * Plugins should use this instead of raw process.on('SIGTERM', ...).
     */
    addCleanupHook(fn: () => Promise<void>): void;
    /**
     * Initiate graceful shutdown
     */
    shutdown(options?: ShutdownOptions): Promise<void>;
    /**
     * Wait for all in-flight requests to complete.
     * Handles both fast-path (count-only) and slow-path (Promise-tracked) requests.
     */
    private drainRequests;
    /**
     * Close database connections based on provider
     */
    private closeDatabase;
}
/**
 * Create a shutdown manager instance
 */
declare function createShutdownManager(): ShutdownManager;

/**
 * A WebSocket connection handle exposed to user handlers.
 *
 * Wraps the underlying uWebSockets.js WebSocket with a clean, type-safe API.
 * Supports uWS-native topics for efficient in-process pub/sub.
 *
 * For cross-instance broadcasting, combine with `@kozojs/redis` pub/sub.
 */
interface KozoWebSocket<T = unknown> {
    /** Send a message to this client. */
    send(data: string | ArrayBuffer | Uint8Array, isBinary?: boolean): void;
    /** Close the connection. */
    close(code?: number, reason?: string): void;
    /** Subscribe this socket to a topic. */
    subscribe(topic: string): void;
    /** Unsubscribe from a topic. */
    unsubscribe(topic: string): void;
    /** Publish a message to all sockets subscribed to a topic. */
    publish(topic: string, data: string | ArrayBuffer | Uint8Array, isBinary?: boolean): void;
    /** Check if this socket is subscribed to a topic. */
    isSubscribed(topic: string): boolean;
    /** Remote IP address. */
    readonly remoteAddress: string;
    /** Per-connection user data (set in `upgrade`, available in all callbacks). */
    data: T;
}
/** Upgrade request info passed to the optional `upgrade` callback. */
interface WsUpgradeRequest {
    url: string;
    query: string;
    headers: Record<string, string>;
}
/**
 * WebSocket route handler — lifecycle callbacks for a WS endpoint.
 *
 * @typeParam T  User data type attached to each connection (set via `upgrade`).
 *
 * @example
 * app.ws<{ userId: string }>('/ws/chat', {
 *   upgrade(req) {
 *     const token = req.headers['authorization'];
 *     const userId = verifyToken(token);
 *     if (!userId) return false; // reject
 *     return { userId };         // attached as ws.data
 *   },
 *   open(ws) {
 *     ws.subscribe('chat');
 *   },
 *   message(ws, data) {
 *     ws.publish('chat', data);
 *   },
 * });
 */
interface WebSocketHandler<T = unknown> {
    /** Called when a new connection is established. */
    open?(ws: KozoWebSocket<T>): void | Promise<void>;
    /** Called when a message is received. */
    message?(ws: KozoWebSocket<T>, data: string | ArrayBuffer, isBinary: boolean): void | Promise<void>;
    /** Called when the connection is closed. */
    close?(ws: KozoWebSocket<T>, code: number, reason: ArrayBuffer): void | Promise<void>;
    /** Called when send backpressure drains. */
    drain?(ws: KozoWebSocket<T>): void;
    /**
     * Upgrade hook — runs before the HTTP→WS upgrade.
     *
     * Return user data to attach to the connection, or `false` to reject (401).
     * Can be async (e.g. for JWT verification).
     */
    upgrade?(req: WsUpgradeRequest): T | false | Promise<T | false>;
    /** Max message size in bytes (default: 1 MB). */
    maxPayloadLength?: number;
    /** Idle timeout in seconds (default: 120). 0 = disabled. */
    idleTimeout?: number;
}

interface UwsCorsConfig {
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

/**
 * Result returned by the user's SSR `render(url)` function.
 *
 * String mode (default):
 *   Return `{ html, head? }` — the entire page is buffered before sending.
 *
 * Streaming mode (React 18 renderToPipeableStream):
 *   Return `{ pipe, head? }` — headers are flushed immediately and HTML is
 *   streamed as Suspense boundaries resolve, improving TTFB.
 */
type SsrRenderResult = {
    html: string;
    head?: string;
} | {
    pipe: (destination: Writable) => void;
    head?: string;
};
/** The render function exported by the SSR server entry module. */
type SsrRenderFn = (url: string) => SsrRenderResult | Promise<SsrRenderResult>;
/** Configuration for Kozo SSR integration. */
interface SsrConfig {
    /** Root directory of the web app (where index.html & vite.config live). */
    root: string;
    /** Path to the server entry module — relative to root (e.g. 'src/entry-server.tsx'). */
    entryServer: string;
    /** Path to the HTML template — relative to root (default: 'index.html'). */
    template?: string;
    /** Placeholder replaced with rendered app HTML (default: '<!--app-html-->'). */
    appPlaceholder?: string;
    /** Placeholder replaced with &lt;head&gt; tags (default: '<!--ssr-head-->'). */
    headPlaceholder?: string;
    /** Directory for built client assets — relative to root (default: 'dist/client'). */
    distClient?: string;
    /** Directory for server bundle — relative to root (default: 'dist/server'). */
    distServer?: string;
    /** URL prefix(es) for routes that bypass SSR and go to Hono (default: '/api'). */
    apiPrefix?: string | string[];
    /**
     * Enable SSR rendering in dev mode.
     *
     * Default: **auto-detected** — if `index.html` contains the app placeholder
     * (`<!--app-html-->`) SSR is enabled automatically, so projects using
     * `entry-server.tsx` + `hydrateRoot` work without any extra config.
     *
     * Set explicitly to `false` to force CSR mode (recommended with
     * `@tailwindcss/vite` v4 to avoid FOUC caused by CSS-in-JS injection).
     */
    devSsr?: boolean;
    /**
     * Critical CSS injected into &lt;head&gt; in dev mode to prevent FOUC.
     * Only applies when devSsr is false (CSR mode).
     * Default: dark background + hidden root until JS loads.
     */
    devCriticalCss?: string;
    /**
     * Set to `false` to silence the startup banner.
     * Inherited from `createKozo({ logger })` when started via `app.listenSsr()`.
     */
    logger?: boolean;
}
/**
 * Create a unified HTTP server that routes API requests through Hono
 * and everything else through the SSR / static pipeline.
 *
 * @param config      SSR configuration
 * @param honoHandler Node.js request listener from `getRequestListener(app.fetch)`
 * @param port        Port to listen on (default: 3000)
 * @returns The created server and resolved port
 */
declare function createSsrServer(config: SsrConfig, honoHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, port?: number): Promise<{
    server: Server;
    port: number;
}>;

/**
 * Compile-time description of one registered HTTP route.
 *
 * The handler is intentionally not part of this type: consumers only need the
 * method, literal path, and schemas to derive clients and test helpers.
 */
interface ContractRoute<TMethod extends HttpMethod$1 = HttpMethod$1, TPath extends string = string, TSchema extends RouteSchema = RouteSchema> {
    readonly method: TMethod;
    readonly path: TPath;
    readonly schema: TSchema;
}
type AnyContractRoute = ContractRoute<HttpMethod$1, string, RouteSchema>;
type TrimLeadingSlash<TPath extends string> = TPath extends `/${infer TRest}` ? TrimLeadingSlash<TRest> : TPath;
type TrimTrailingSlash<TPath extends string> = TPath extends `${infer TRest}/` ? TrimTrailingSlash<TRest> : TPath;
type TrimSlashes<TPath extends string> = TrimTrailingSlash<TrimLeadingSlash<TPath>>;
/**
 * Join a route prefix and child path with exactly one leading separator.
 */
type JoinRoutePaths<TPrefix extends string, TPath extends string, TPrefixPart extends string = TrimSlashes<TPrefix>, TPathPart extends string = TrimSlashes<TPath>> = TPrefixPart extends '' ? TPathPart extends '' ? '/' : `/${TPathPart}` : TPathPart extends '' ? `/${TPrefixPart}` : `/${TPrefixPart}/${TPathPart}`;
type PrefixContractRoutes<TPrefix extends string, TRoutes extends AnyContractRoute> = TRoutes extends ContractRoute<infer TMethod, infer TPath, infer TSchema> ? ContractRoute<TMethod, JoinRoutePaths<TPrefix, TPath>, TSchema> : never;
/**
 * Fluent, statically typed collection of Kozo routes.
 *
 * Capture the returned value (normally by chaining calls) so TypeScript can
 * retain the accumulated route union.
 */
declare class RouteContract<TServices extends Services = Services, TRoutes extends AnyContractRoute = never> {
    private readonly registrations;
    get<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): RouteContract<TServices, TRoutes | ContractRoute<'get', TPath, {}>>;
    get<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): RouteContract<TServices, TRoutes | ContractRoute<'get', TPath, TSchema>>;
    post<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): RouteContract<TServices, TRoutes | ContractRoute<'post', TPath, {}>>;
    post<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): RouteContract<TServices, TRoutes | ContractRoute<'post', TPath, TSchema>>;
    put<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): RouteContract<TServices, TRoutes | ContractRoute<'put', TPath, {}>>;
    put<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): RouteContract<TServices, TRoutes | ContractRoute<'put', TPath, TSchema>>;
    patch<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): RouteContract<TServices, TRoutes | ContractRoute<'patch', TPath, {}>>;
    patch<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): RouteContract<TServices, TRoutes | ContractRoute<'patch', TPath, TSchema>>;
    delete<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): RouteContract<TServices, TRoutes | ContractRoute<'delete', TPath, {}>>;
    delete<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): RouteContract<TServices, TRoutes | ContractRoute<'delete', TPath, TSchema>>;
    private add;
}
/** Create an empty route contract. Capture route additions through chaining. */
declare function createRouter<TServices extends Services = Services>(): RouteContract<TServices>;
/** Descriptive alias for {@link createRouter}. */
declare const defineRoutes: typeof createRouter;

interface Plugin {
    name: string;
    version?: string;
    install: (app: Kozo<Services>) => void | Promise<void>;
}
/** Options for {@link Kozo.mountDocs}. */
interface MountDocsOptions {
    /**
     * Base path of the Swagger UI page; the OpenAPI spec is served at
     * `${path}.json`. Default: `/docs`.
     */
    path?: string;
    /** Title shown in Swagger UI and the spec. Default: `'API'`. */
    title?: string;
    /** Spec `info.version`. Default: `'0.0.0'`. */
    version?: string;
    /** Spec `info.description`. */
    description?: string;
    /** OpenAPI `servers` entries. */
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    /**
     * Whether the docs routes are mounted at all.
     * Default: `process.env.NODE_ENV !== 'production'` — the spec is a complete
     * map of the API surface, so in production it stays off unless you opt in
     * explicitly (e.g. `enabled: env.ENABLE_DOCS`).
     */
    enabled?: boolean;
}
/**
 * A route sub-router that prepends a fixed prefix to every registered path.
 * Created via `app.group('/prefix', (r) => { r.get('/...', handler) })`.
 */
declare class KozoGroup<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>, TRoutes extends AnyContractRoute = never> {
    private readonly prefix;
    private readonly parent;
    constructor(prefix: string, parent: Kozo<TServices, TScoped, TRoutes>);
    get(path: string, handler: KozoHandler<{}, TServices>): this;
    get<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
    post(path: string, handler: KozoHandler<{}, TServices>): this;
    post<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
    put(path: string, handler: KozoHandler<{}, TServices>): this;
    put<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
    patch(path: string, handler: KozoHandler<{}, TServices>): this;
    patch<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
    delete(path: string, handler: KozoHandler<{}, TServices>): this;
    delete<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
    /** Create a nested runtime group while preserving normalized paths. */
    group(prefix: string, fn: (router: KozoGroup<TServices, TScoped, TRoutes>) => void): this;
}
/**
 * Kozo - High-performance TypeScript framework with Zod schemas
 *
 * @typeParam TServices - Shape of the services object injected into every handler.
 *   Pass it once at construction: `createKozo<{ db: Database }>({ services: { db } })`
 *   and all handler contexts will have `ctx.services.db` fully typed.
 */
declare class Kozo<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>, TRoutes extends AnyContractRoute = never> {
    private app;
    private services;
    private _scope?;
    private routes;
    /** Deferred uWS route data — compiled lazily only when nativeListen() is called. */
    private _deferredUws;
    private shutdownManager;
    private _routesDir?;
    private _wsRoutes;
    private _onStart?;
    private _onStop?;
    private _maxBodyBytes;
    private _logger;
    private _onError?;
    private _onNotFound?;
    private _allowUnenforcedResponse;
    /** Async plugin installs queued by use() — flushed before the server binds. */
    private _pendingPluginInstalls;
    /** Normalize bare Zod response schema → { 200: schema } for OpenAPI generators */
    private static normalizeSchema;
    constructor(config?: KozoConfig<TServices, TScoped>);
    use(plugin: Plugin): this;
    /** Await all async plugin installs registered via use(). Called before bind. */
    private flushPluginInstalls;
    /**
     * Load routes from the file system using the configured routesDir.
     * Each route file is dynamically imported, its schema compiled, and handler registered.
     *
     * Also scans for `_middleware.ts` files in each directory and registers them
     * as scoped Hono middleware (parent directories run first):
     *
     *   routes/_middleware.ts        → applies to all routes
     *   routes/admin/_middleware.ts  → applies to /admin/* routes only
     *
     * This is a no-op if routesDir is not configured.
     */
    loadRoutes(routesDir?: string): Promise<this>;
    generateClient(baseUrl?: string): string;
    generateClient(options?: ClientGeneratorOptions): string;
    get<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): Kozo<TServices, TScoped, TRoutes | ContractRoute<'get', TPath, {}>>;
    get<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): Kozo<TServices, TScoped, TRoutes | ContractRoute<'get', TPath, TSchema>>;
    post<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): Kozo<TServices, TScoped, TRoutes | ContractRoute<'post', TPath, {}>>;
    post<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): Kozo<TServices, TScoped, TRoutes | ContractRoute<'post', TPath, TSchema>>;
    put<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): Kozo<TServices, TScoped, TRoutes | ContractRoute<'put', TPath, {}>>;
    put<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): Kozo<TServices, TScoped, TRoutes | ContractRoute<'put', TPath, TSchema>>;
    patch<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): Kozo<TServices, TScoped, TRoutes | ContractRoute<'patch', TPath, {}>>;
    patch<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): Kozo<TServices, TScoped, TRoutes | ContractRoute<'patch', TPath, TSchema>>;
    delete<const TPath extends string>(path: TPath, handler: KozoHandler<{}, TServices>): Kozo<TServices, TScoped, TRoutes | ContractRoute<'delete', TPath, {}>>;
    delete<const TPath extends string, const TSchema extends RouteSchema>(path: TPath, schema: TSchema, handler: KozoHandler<TSchema, TServices>, meta?: RouteMeta): Kozo<TServices, TScoped, TRoutes | ContractRoute<'delete', TPath, TSchema>>;
    /**
     * Group routes under a common path prefix.
     *
     * @example
     * app.group('/users', (r) => {
     *   r.get('/',    { query: paginationSchema }, (ctx) => listUsers(ctx.query));
     *   r.get('/:id', { params: uuidParams },     (ctx) => getUser(ctx.params.id));
     *   r.post('/',   { body: CreateUserSchema }, (ctx) => createUser(ctx.body));
     * });
     */
    group(prefix: string, fn: (router: KozoGroup<TServices, TScoped, TRoutes>) => void): this;
    /**
     * Register a statically typed route contract below a path prefix.
     *
     * The returned value carries the mounted route union for contract-aware
     * tooling. Capture it through chaining or assignment.
     */
    mount<const TPrefix extends string, TContractRoutes extends AnyContractRoute>(prefix: TPrefix, contract: RouteContract<TServices, TContractRoutes>): Kozo<TServices, TScoped, TRoutes | PrefixContractRoutes<TPrefix, TContractRoutes>>;
    /**
     * Register a WebSocket endpoint (requires `nativeListen()` with uWebSockets.js).
     *
     * @example
     * app.ws('/ws/chat', {
     *   open(ws)  { ws.subscribe('chat'); },
     *   message(ws, data) { ws.publish('chat', data); },
     * });
     *
     * // With typed user data and auth:
     * app.ws<{ userId: string }>('/ws/secure', {
     *   upgrade(req) {
     *     const userId = verifyToken(req.headers['authorization']);
     *     return userId ? { userId } : false;
     *   },
     *   open(ws) { console.log(ws.data.userId, 'connected'); },
     * });
     */
    ws<T = unknown>(path: string, handler: WebSocketHandler<T>): this;
    private register;
    /**
     * Start a uWebSockets.js HTTP server.
     *
     * All routes are registered directly with uWS's C++ radix trie router —
     * zero JS routing overhead per request. The C++ HTTP parser (µHttpParser)
     * eliminates all IncomingMessage/ServerResponse allocations.
     *
     * Throws if uWebSockets.js is not installed.
     * Returns { port, server } so callers can close the server when done.
     */
    nativeListen(portOrOptions?: number | {
        port?: number;
        cors?: UwsCorsConfig;
    }): Promise<{
        port: number;
        server: Server;
    }>;
    listen(port?: number): Promise<{
        port: number;
        server: Server;
    }>;
    /**
     * Start a unified server that handles both API routes and SSR-rendered pages.
     *
     * API routes (matching `ssrConfig.apiPrefix`, default `/api`) are routed
     * through Hono. All other requests go through the Vite SSR pipeline:
     * - Dev:  Vite middleware for HMR + optional SSR rendering
     * - Prod: Static file serving + SSR template rendering
     *
     * This eliminates the need for a separate frontend server and API proxy.
     *
     * @example
     * const app = createKozo({ routesDir: './src/routes' });
     * await app.loadRoutes();
     *
     * await app.listenSsr(3000, {
     *   root: path.resolve(__dirname, '../web'),
     *   entryServer: 'src/entry-server.tsx',
     * });
     */
    listenSsr(port: number, ssrConfig: SsrConfig): Promise<{
        server: Server;
        port: number;
    }>;
    /**
     * Graceful shutdown — drains in-flight requests before closing.
     * Calls `onStop` lifecycle hook after draining and internal cleanup.
     * Use getShutdownManager().setDatabase(db, provider) to register DB cleanup.
     */
    shutdown(options?: ShutdownOptions): Promise<void>;
    getShutdownManager(): ShutdownManager;
    getApp(): Hono<KozoEnv>;
    /**
     * Register a Hono middleware on the app.
     *
     * Patterns are tracked so `nativeListen()` can bridge any covered route
     * through the Hono pipeline (auth, rate limits, CORS, `_middleware.ts`, …).
     *
     * NOTE: bridged routes lose the zero-shim uWS fast path. For cross-cutting
     * security (auth, rate limits, role checks) prefer {@link guard} — it runs
     * the same check on both transports at native speed. Use `middleware()`
     * only for logic that genuinely needs the Hono `Context`.
     *
     * @example
     * app.middleware('/api/*', async (c, next) => {
     *   c.set('user', await verifyJwt(c.req.header('authorization')));
     *   return next();
     * });
     */
    private _middlewarePatterns;
    middleware(handler: MiddlewareHandler<KozoEnv>): this;
    middleware(path: string, handler: MiddlewareHandler<KozoEnv>): this;
    /**
     * Guards registered via {@link guard}. Unlike `_middlewarePatterns`, these
     * do NOT force routes through the Hono bridge under `nativeListen()` —
     * they are compiled directly into the uWS fast path.
     */
    private _guards;
    /**
     * Register a transport-agnostic guard (auth, rate-limit, …).
     *
     * The same guard function runs on BOTH transports:
     * - `listen()`        → as a Hono middleware
     * - `nativeListen()`  → compiled into the zero-shim uWS path (no Hono,
     *                       no Request/Response allocation — native speed)
     *
     * This is the recommended way to protect routes when using the uWS
     * transport: `app.middleware()` forces covered routes through the Hono
     * bridge, `app.guard()` does not.
     *
     * @example
     * app.guard('/api/*', async (req) => {
     *   const token = req.header('authorization')?.slice(7);
     *   if (!token) return { deny: { status: 401 } };
     *   const user = await verifyJwt(token);
     *   return user ? { user } : { deny: { status: 401 } };
     * });
     */
    guard(pattern: string, guard: KozoGuard): this;
    /**
     * Returns all registered routes (file-system + manual) after {@link loadRoutes} completes.
     * Use this to inspect `meta.auth`, `meta.tags`, etc. at runtime.
     *
     * @example
     * await app.loadRoutes();
     * const publicRoutes = app.getRoutes().filter(r => r.meta?.auth === false);
     */
    getRoutes(): ReadonlyArray<{
        method: HttpMethod$1;
        path: string;
        schema: RouteSchema;
        meta?: RouteMeta;
    }>;
    /**
     * Mounts Swagger UI + the OpenAPI 3.1 spec of every registered route.
     *
     * Safe by default: outside `NODE_ENV=production` the docs are on; in
     * production they are NOT mounted unless `enabled: true` is passed
     * explicitly. The spec is generated lazily on the first request (and then
     * cached), so `mountDocs()` can be called before or after `loadRoutes()`
     * and works with `listen()` and `nativeListen()` alike.
     *
     * Both routes carry `meta.auth: false`; auth layers that scan route files
     * (e.g. `@kozojs/auth`'s `registerAuthBeforeLoadRoutes`) still need the two
     * paths in `extraPublicPaths`.
     *
     * @example
     * app.mountDocs({ title: 'my-api', version: '1.0.0', path: '/api/docs' });
     * // production opt-in:
     * app.mountDocs({ enabled: env.ENABLE_DOCS });
     */
    mountDocs(options?: MountDocsOptions): this;
    get fetch(): (request: Request, Env?: unknown, executionCtx?: hono.ExecutionContext) => Response | Promise<Response>;
}
declare function createKozo<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>>(config?: KozoConfig<TServices, TScoped>): Kozo<TServices, TScoped, never>;

/** Tells the Kozo CLI which type to inject into `KozoServices` (auto-generated `.kozo/types.d.ts`). */
interface KozoAppTypesRef {
    /** Module path relative to project root, e.g. `src/lib/services/index.js` */
    from: string;
    /** Exported interface name, e.g. `AppServices` */
    name: string;
}
interface KozoAppHooks<TServices extends Services> {
    app: Kozo<TServices>;
    services: TServices;
}
interface KozoAppDefinition<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>> {
    routesDir: string;
    services: () => TServices | Promise<TServices>;
    /** Optional — only used by the augmentation-based typegen (`kozo types`). */
    types?: KozoAppTypesRef;
    configure?: (ctx: KozoAppHooks<TServices>) => void | Promise<void>;
    onReady?: (ctx: Pick<KozoAppHooks<TServices>, 'app'>) => void | Promise<void>;
    kozo?: Omit<KozoConfig<TServices, TScoped>, 'services' | 'routesDir'>;
    build: () => Promise<Kozo<TServices, TScoped>>;
}
interface DefineKozoAppOptions<TServices extends Services, TScoped extends Record<string, unknown> = Record<string, never>> {
    routesDir?: string;
    services: () => TServices | Promise<TServices>;
    /**
     * Optional — only needed for the augmentation-based typegen
     * (`kozo types` / `renderKozoTypesDts`). Apps using
     * `createRouteFactory` + a `#kozo` subpath import don't need it.
     */
    types?: KozoAppTypesRef;
    configure?: (ctx: KozoAppHooks<TServices>) => void | Promise<void>;
    onReady?: (ctx: Pick<KozoAppHooks<TServices>, 'app'>) => void | Promise<void>;
}
/**
 * Declare a Kozo app — used in `kozo.config.ts`.
 * The CLI reads {@link KozoAppTypesRef} and generates `.kozo/types.d.ts` so route
 * handlers get typed `ctx.services` without manual module augmentation.
 */
declare function defineKozoApp<TServicesFn extends () => Services | Promise<Services>, TScoped extends Record<string, unknown> = Record<string, never>>(options: DefineKozoAppOptions<Awaited<ReturnType<TServicesFn>>, TScoped> & Omit<KozoConfig<Awaited<ReturnType<TServicesFn>>, TScoped>, 'services' | 'routesDir'> & {
    services: TServicesFn;
}): KozoAppDefinition<Awaited<ReturnType<TServicesFn>>, TScoped>;
/** Bootstrap a app from {@link defineKozoApp}. */
declare function buildKozoApp<TServices extends Services, TScoped extends Record<string, unknown> = Record<string, never>>(definition: KozoAppDefinition<TServices, TScoped>): Promise<Kozo<TServices, TScoped>>;
/** Generate `.kozo/types.d.ts` source (CLI / Node). */
declare function renderKozoTypesDts(types: KozoAppTypesRef, projectRoot: string): Promise<string>;
declare const KOZO_TYPES_CANDIDATES: readonly ["src/kozo.types.ts", "src/kozo.types.js", "kozo.types.ts"];
declare const KOZO_CONFIG_CANDIDATES: readonly ["kozo.config.ts", "kozo.config.js", "src/kozo.config.ts", "src/kozo.config.js"];
declare const KOZO_TYPES_OUTPUT = ".kozo/types.d.ts";

/** Per-request DI factory + optional teardown — set via `createKozo({ scopedServices })`. */
interface ScopeConfig<TBase extends Services = Services, TScoped extends Record<string, unknown> = Record<string, unknown>> {
    base: TBase;
    factory: (base: TBase, req: KozoRequest) => TScoped | Promise<TScoped>;
    onEnd?: (scoped: TScoped, error?: Error) => void | Promise<void>;
}
/** Internal scope handle passed to route compilers (erased generics). */
type AnyScopeConfig = ScopeConfig<Services, Record<string, unknown>>;

type ZValidatorErrors = {
    instancePath: string;
    message: string;
    keyword?: string;
    path?: (string | number)[];
}[];
interface ZValidateResult {
    valid: boolean;
    errors: ZValidatorErrors | null;
}
type ZValidator = (data: unknown) => ZValidateResult;
/** Optional per-app error hook from {@link KozoConfig.onError}. */
type KozoErrorHook = (error: Error, ctx: unknown) => Response | Promise<Response> | void;
type CompiledHandler = (c: Context) => Promise<Response> | Response;
type UserHandler = (c: any) => any;
type CompiledRoute = {
    validateBody?: ZValidator;
    validateQuery?: ZValidator;
    validateParams?: ZValidator;
    validateHeaders?: ZValidator;
    serialize?: (data: any) => string;
    serializeByStatus?: Readonly<Record<number, (data: any) => string>>;
};
/** Options controlling diagnostics for {@link SchemaCompiler.compile}. */
interface CompileOptions {
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
declare class SchemaCompiler {
    static compile(schema: RouteSchema, opts?: CompileOptions): CompiledRoute;
}
declare function compileRouteHandler(handler: UserHandler, schema: RouteSchema, services: Services, compiled: CompiledRoute, scope?: AnyScopeConfig, errorHook?: KozoErrorHook): CompiledHandler;

/**
 * Build a NativeKozoContext for a native route handler.
 *
 * Called by the native handler compiler (`compiler.ts`) when the route
 * is registered via `nativeRoute()`.  Not intended for direct use.
 *
 * @internal
 */
declare function buildNativeContext<S extends RouteSchema, TSvc extends Services>(req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: any, services: TSvc, serialize?: (data: any) => string): NativeKozoContext<S, TSvc>;

/** Fast number → string for Content-Length. Cached for values < 10 000. */
declare function fastCL(n: number): string;
/**
 * Write a 200 JSON response.
 *
 * Uses `Buffer.byteLength(body)` for Content-Length to correctly handle
 * any UTF-8 content in the body (emoji, non-ASCII characters, etc.).
 */
declare function fastWriteJson(res: ServerResponse, body: string): void;
/**
 * Write a plain text response.
 */
declare function fastWriteText(res: ServerResponse, body: string, status?: number): void;
/**
 * Write an HTML response (SSR page rendering).
 */
declare function fastWriteHtml(res: ServerResponse, body: string, status?: number): void;
/**
 * Write a JSON response with a custom status code.
 */
declare function fastWriteJsonStatus(res: ServerResponse, body: string, status: number): void;
/**
 * Write a pre-built 404 Not Found response (zero allocation).
 */
declare function fastWrite404(res: ServerResponse): void;
/**
 * Write a pre-built 500 Internal Server Error response (zero allocation).
 */
declare function fastWrite500(res: ServerResponse): void;
/**
 * Write a 400 validation error response.
 * Allocates only the error body string.
 */
declare function fastWrite400(field: string, errors: any, res: ServerResponse): void;
/**
 * Write a KozoError as an RFC 7807 problem+json response.
 * Falls back to 500 for unknown errors.
 */
declare function fastWriteError(err: unknown, res: ServerResponse): void;

/**
 * Kozo Error System - RFC 7807 Problem Details
 *
 * Standardized error format for all validation and runtime errors.
 * Pre-serialized templates + frozen ResponseInit objects eliminate
 * per-request allocations on the hot path.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */
interface ValidationError {
    field: string;
    path?: (string | number)[];
    message: string;
    code: string;
    value?: unknown;
}
interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
    errors?: ValidationError[];
}
declare const ERROR_RESPONSES: {
    readonly VALIDATION_FAILED: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#validation-failed";
        readonly title: "Validation Failed";
        readonly status: 400;
    };
    readonly INVALID_BODY: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#invalid-body";
        readonly title: "Invalid Request Body";
        readonly status: 400;
    };
    readonly INVALID_QUERY: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#invalid-query";
        readonly title: "Invalid Query Parameters";
        readonly status: 400;
    };
    readonly INVALID_PARAMS: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#invalid-params";
        readonly title: "Invalid Path Parameters";
        readonly status: 400;
    };
    readonly INTERNAL_ERROR: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#internal-error";
        readonly title: "Internal Server Error";
        readonly status: 500;
    };
    readonly NOT_FOUND: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#not-found";
        readonly title: "Resource Not Found";
        readonly status: 404;
    };
    readonly UNAUTHORIZED: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#unauthorized";
        readonly title: "Unauthorized";
        readonly status: 401;
    };
    readonly FORBIDDEN: {
        readonly type: "https://kozo-docs.vercel.app/docs/core/errors#forbidden";
        readonly title: "Forbidden";
        readonly status: 403;
    };
};
/**
 * Convert Zod validation errors to standardized format
 */
declare function formatZodErrors(errors: any): ValidationError[];
/**
 * Build a 400 Validation Failed response.
 * Called on every invalid request — kept as lean as possible.
 */
declare function validationErrorResponse(field: string, ajvErrors: any[] | null | undefined, instance?: string): Response;
/**
 * Build a 500 Internal Server Error response.
 */
declare function internalErrorResponse(err: Error, instance?: string): Response;
declare function notFoundResponse(instance?: string): Response;
declare function unauthorizedResponse(instance?: string): Response;
declare function forbiddenResponse(instance?: string): Response;
declare class KozoError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(message: string, statusCode: number, code: string);
    toResponse(instance?: string): Response;
}
declare class ValidationFailedError extends KozoError {
    readonly errors: ValidationError[];
    constructor(message: string, errors?: ValidationError[]);
    toResponse(instance?: string): Response;
}
declare class NotFoundError extends KozoError {
    constructor(message?: string);
}
declare class UnauthorizedError extends KozoError {
    constructor(message?: string);
}
declare class ForbiddenError extends KozoError {
    constructor(message?: string);
}
declare class ConflictError extends KozoError {
    constructor(message?: string);
}
declare class GoneError extends KozoError {
    constructor(message?: string);
}
declare class BadRequestError extends KozoError {
    constructor(message?: string);
}

interface OpenAPIInfo {
    title: string;
    version: string;
    description?: string;
    contact?: {
        name?: string;
        url?: string;
        email?: string;
    };
    license?: {
        name: string;
        url?: string;
    };
}
interface OpenAPIConfig {
    info: OpenAPIInfo;
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    tags?: Array<{
        name: string;
        description?: string;
    }>;
    security?: Array<Record<string, string[]>>;
}
interface OpenAPISpec {
    openapi: '3.1.0';
    info: OpenAPIInfo;
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    tags?: Array<{
        name: string;
        description?: string;
    }>;
    paths: Record<string, PathItem>;
    components: {
        schemas: Record<string, SchemaObject>;
        securitySchemes?: Record<string, SecurityScheme>;
    };
    security?: Array<Record<string, string[]>>;
}
interface PathItem {
    [method: string]: OperationObject;
}
interface OperationObject {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: ParameterObject[];
    requestBody?: RequestBodyObject;
    responses: Record<string, ResponseObject>;
    security?: Array<Record<string, string[]>>;
}
interface ParameterObject {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie';
    required?: boolean;
    schema: SchemaObject;
    description?: string;
}
interface RequestBodyObject {
    required?: boolean;
    content: {
        'application/json': {
            schema: SchemaObject;
        };
    };
}
interface ResponseObject {
    description: string;
    content?: {
        'application/json': {
            schema: SchemaObject;
        };
    };
}
interface SchemaObject {
    type?: string;
    format?: string;
    properties?: Record<string, SchemaObject>;
    items?: SchemaObject;
    required?: string[];
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    description?: string;
    default?: unknown;
    nullable?: boolean;
    oneOf?: SchemaObject[];
    anyOf?: SchemaObject[];
    allOf?: SchemaObject[];
    additionalProperties?: SchemaObject | boolean;
    $ref?: string;
}
interface SecurityScheme {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
    scheme?: string;
    bearerFormat?: string;
    name?: string;
    in?: 'query' | 'header' | 'cookie';
}
declare class OpenAPIGenerator {
    private config;
    private schemas;
    private schemaCounter;
    constructor(config: OpenAPIConfig);
    /**
     * Generate OpenAPI spec from routes
     */
    generate(routes: RouteDefinition[]): OpenAPISpec;
    /**
     * Convert Hono path params to OpenAPI format
     * :id -> {id}
     */
    private honoPathToOpenApi;
    /**
     * Convert route to OpenAPI operation
     */
    private routeToOperation;
    /**
     * Generate operation ID from path and method
     */
    private generateOperationId;
    /**
     * Extract tag from path (first segment)
     */
    private extractTag;
    /**
     * Get HTTP status description
     */
    private getStatusDescription;
    private capitalize;
}
declare function generateSwaggerHtml(specUrl: string, title?: string): string;
declare function createOpenAPIGenerator(config: OpenAPIConfig): OpenAPIGenerator;

declare const HTTP_METHODS: readonly ["get", "post", "put", "patch", "delete"];
type HttpMethod = (typeof HTTP_METHODS)[number];
interface ParsedRoute {
    path: string;
    method: HttpMethod;
}
/**
 * Convert file path to URL path and HTTP method
 *
 * Examples:
 *   users/index.ts          → GET   /users
 *   users/get.ts            → GET   /users
 *   users/post.ts           → POST  /users
 *   users/[id].ts           → GET   /users/:id
 *   users/[id]/get.ts       → GET   /users/:id
 *   users/[id]/patch.ts     → PATCH /users/:id
 *   users/[id?].ts          → GET   /users/:id?  (optional param)
 *   posts/[...slug].ts      → GET   /posts/*     (catch-all)
 *   health.ts               → GET   /health
 *   [id?]/posts/[postId?].ts → GET  /:id?/posts/:postId?
 */
declare function fileToPath(filePath: string): ParsedRoute | null;
/**
 * Check if a file should be treated as a route
 */
declare function isRouteFile(filename: string): boolean;
/**
 * Check if a file is a per-directory middleware file.
 * Convention: `_middleware.ts` or `_middleware.js` in any route directory.
 */
declare function isMiddlewareFile(filename: string): boolean;

interface ScanOptions {
    routesDir: string;
    verbose?: boolean;
}
/** Normalize a dynamically imported route module to handler + schema + meta. */
declare function resolveRouteModule<S extends RouteSchema = RouteSchema>(module: RouteModule<S>): ResolvedRouteModule<S> | null;
/**
 * Scan routes directory and return route definitions
 */
declare function scanRoutes(options: ScanOptions): Promise<RouteDefinition[]>;

/**
 * Scan for `_middleware.ts` / `_middleware.js` files in the routes directory tree.
 *
 * Each file is dynamically imported and its default export registered as Hono
 * middleware scoped to that directory's URL prefix:
 *
 *   routes/_middleware.ts        → `app.use('/*', mw)`       (global)
 *   routes/admin/_middleware.ts  → `app.use('/admin/*', mw)` (scoped)
 *   routes/admin/users/_middleware.ts → `app.use('/admin/users/*', mw)`
 *
 * Returns definitions sorted by path depth (root first) so that parent
 * middleware always runs before child middleware.
 */
declare function scanMiddleware(options: ScanOptions): Promise<MiddlewareDefinition[]>;

/**
 * Validate and parse environment variables at startup.
 * Throws a descriptive error if any variable is missing or invalid.
 *
 * @example
 * const env = defineEnv({
 *   PORT:         z.coerce.number().default(3000),
 *   DATABASE_URL: z.string().url(),
 *   JWT_SECRET:   z.string().min(32),
 * });
 * // env.PORT           → number
 * // env.DATABASE_URL   → string
 * app.listen(env.PORT);
 */
declare function defineEnv<T extends z.ZodRawShape>(shape: T): z.infer<z.ZodObject<T>>;
/** Options for {@link requireSecret}. */
interface RequireSecretOptions {
    /**
     * Minimum accepted length in bytes. Defaults to 32 — the SHA-256 output size,
     * past which an HMAC-SHA256 key gains no further strength.
     */
    minBytes?: number;
}
/**
 * Read a signing secret from the environment, or refuse to start.
 *
 * Unlike reading the variable directly and defaulting to a literal, this has no
 * fallback: a missing, too-short or publicly-known secret throws here, at
 * startup, instead of silently signing tokens with a value an attacker has too.
 *
 * Throws when the variable is unset, empty, shorter than `minBytes`, or equal
 * to one of the secrets Kozo has itself published (see `KNOWN_WEAK_SECRETS`).
 * Unlike the `@kozojs/auth` guards, which only warn about a short secret outside
 * production, this is strict on every `NODE_ENV` — you asked for a secret.
 *
 * @example
 * import { requireSecret } from '@kozojs/core';
 * const secret = requireSecret('JWT_SECRET');
 * app.guard('/api/*', jwtGuard(secret));
 */
declare function requireSecret(name: string, options?: RequireSecretOptions): string;
interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}
/**
 * Slice an in-memory array into a paginated result.
 * Pairs naturally with `paginationSchema` for the query params.
 *
 * @example
 * app.get('/users', { query: paginationSchema }, (ctx) => {
 *   return paginate(users, ctx.query.page, ctx.query.limit);
 * });
 */
declare function paginate<T>(items: T[], page: number, limit: number): PaginatedResult<T>;
/**
 * Generate a RFC 4122 v4 UUID.
 * Uses Node.js `crypto.randomUUID()` — cryptographically secure, zero dependencies.
 *
 * @example
 * import { uuid } from '@kozojs/core';
 * const id = uuid(); // '550e8400-e29b-41d4-a716-446655440000'
 */
declare function uuid(): string;
/**
 * Common pagination query schema.
 * Use it directly as the `query` field to avoid repeating this pattern everywhere.
 *
 * @example
 * app.get('/users', { query: paginationSchema }, (ctx) => {
 *   const { page, limit } = ctx.query; // fully typed
 * });
 */
declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
/**
 * Route param schema for `:id` routes that expect a UUID.
 *
 * @example
 * app.get('/users/:id', { params: uuidParams }, (ctx) => ctx.params.id);
 */
declare const uuidParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
/**
 * Route param schema for `:id` routes that expect a positive integer.
 *
 * @example
 * app.get('/posts/:id', { params: idParams }, (ctx) => ctx.params.id);
 */
declare const idParams: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
/**
 * Timestamps schema — extends any entity schema with createdAt/updatedAt.
 *
 * @example
 * const UserSchema = z.object({ name: z.string() }).merge(timestamps);
 * // or use .extend: z.object({ ... }).extend(timestamps.shape)
 */
declare const timestamps: z.ZodObject<{
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, z.core.$strip>;
/**
 * Common sort query params.
 *
 * @example
 * app.get('/users', { query: paginationSchema.merge(sortSchema) }, handler);
 */
declare const sortSchema: z.ZodObject<{
    sortBy: z.ZodOptional<z.ZodString>;
    sortOrder: z.ZodDefault<z.ZodEnum<{
        asc: "asc";
        desc: "desc";
    }>>;
}, z.core.$strip>;
/**
 * Search query param (text search).
 *
 * @example
 * app.get('/products', { query: paginationSchema.merge(searchSchema) }, handler);
 */
declare const searchSchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Generic success response schema.
 *
 * @example
 * app.post('/confirm', { response: successSchema }, handler);
 */
declare const successSchema: z.ZodObject<{
    success: z.ZodBoolean;
    message: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * Standard success/deleted response schema.
 *
 * @example
 * app.delete('/users/:id', { params: uuidParams, response: deletedSchema }, ...);
 */
declare const deletedSchema: z.ZodObject<{
    success: z.ZodBoolean;
    deletedId: z.ZodString;
}, z.core.$strip>;

/**
 * Known-weak secrets, and the shared "is this secret usable" check.
 *
 * Every literal in {@link KNOWN_WEAK_SECRETS} has been published — in a starter
 * template, a scaffold generator or a docs example — and is therefore public
 * knowledge. A service signing tokens with one of them can have any token,
 * including an admin one, forged by anyone who has read the package.
 *
 * This module is the single place those strings are allowed to appear. A test
 * (`packages/cli/__tests__/no-weak-secrets.test.ts`) asserts they exist nowhere
 * else in the repository.
 *
 * Consumers:
 * - `requireSecret()` in `helpers.ts` — strict, for application startup.
 * - `authenticateJWT()` / `jwtGuard()` / `createJWT()` in `@kozojs/auth` —
 *   construction/signing-time, so a bad secret fails before it protects data.
 */
/**
 * Minimum accepted secret length, in bytes.
 *
 * 32 bytes is the output size of SHA-256 and the point past which HMAC-SHA256
 * gains no further strength from a longer key. Anything shorter is a shorter
 * key than the algorithm it feeds.
 */
declare const MIN_SECRET_BYTES = 32;
/** Shell one-liner that produces a secret this module accepts. */
declare const GENERATE_SECRET_COMMAND = "node -e \"console.log(require('node:crypto').randomBytes(48).toString('base64url'))\"";
/**
 * Secret values that must never protect a running service.
 *
 * Tier 1 — literals shipped inside a released Kozo artefact (starter templates,
 * `.env.example` files, scaffold generators). These are the ones an operator can
 * be running today without knowing it.
 *
 * Tier 2 — placeholders used in Kozo's own documentation and JSDoc examples.
 * Both are below {@link MIN_SECRET_BYTES} and so would be refused in production
 * on length alone; listing them makes them fail in development too, which is
 * where the mistake is actually made.
 *
 * Entries are deliberately unambiguous hyphenated tokens. Bare words like
 * `secret` or `password` are not listed: they are already refused on length,
 * and as blocklist entries they are useless — they match a JSON key, a prose
 * sentence and a database column as readily as a secret, which would make the
 * repository-wide scan that guards this list unusable.
 */
declare const KNOWN_WEAK_SECRETS: ReadonlySet<string>;
/** True when `value` is a secret Kozo has published and must refuse. */
declare function isKnownWeakSecret(value: string): boolean;
/** UTF-8 byte length of a secret — not `.length`, which counts UTF-16 units. */
declare function secretByteLength(value: string): number;
/** Options for {@link assertStrongSecret}. */
interface AssertStrongSecretOptions {
    /**
     * What supplied the secret, quoted verbatim in the message so the operator can
     * find it — an env var name (`'JWT_SECRET'`) or an API (`'jwtGuard(secret)'`).
     */
    source: string;
    /** Minimum accepted length in bytes. Defaults to {@link MIN_SECRET_BYTES}. */
    minBytes?: number;
    /**
     * What to do with a secret that is merely too short — a known-weak literal is
     * always thrown on, regardless of this setting.
     *
     * - `'throw'` — always reject. Used by `requireSecret()`.
     * - `'auto'`  — reject when `NODE_ENV === 'production'`, otherwise warn once
     *   per distinct secret. Used by the `@kozojs/auth` guards, so that adding the
     *   check does not stop an existing development setup from booting.
     *
     * @default 'auto'
     */
    onShort?: 'throw' | 'auto';
}
/**
 * Throw if `value` cannot be trusted as a signing secret.
 *
 * Call this at construction or startup — never per request. A server that
 * refuses to boot is a fixable incident; one that boots and 500s on request 1
 * is an outage.
 */
declare function assertStrongSecret(value: string | Uint8Array, options: AssertStrongSecretOptions): void;

export { type AnyContractRoute, type AssertStrongSecretOptions, BadRequestError, type ClientGeneratorOptions, type CompiledRoute, ConflictError, type ContractRoute, type DefineKozoAppOptions, ERROR_RESPONSES, ForbiddenError, GENERATE_SECRET_COMMAND, GoneError, type InflightTracker, type JoinRoutePaths, KNOWN_WEAK_SECRETS, KOZO_CONFIG_CANDIDATES, KOZO_TYPES_CANDIDATES, KOZO_TYPES_OUTPUT, Kozo, type KozoAppDefinition, type KozoAppHooks, type KozoAppTypesRef, KozoConfig, KozoEnv, KozoError, KozoGroup, KozoGuard, KozoHandler, KozoRequest, type KozoWebSocket, MIN_SECRET_BYTES, MiddlewareDefinition, type MountDocsOptions, NativeKozoContext, NotFoundError, type OpenAPIConfig, OpenAPIGenerator, type OpenAPIInfo, type OpenAPISpec, type PaginatedResult, type Plugin, type PrefixContractRoutes, type ProblemDetails, type RequireSecretOptions, ResolvedRouteModule, RouteContract, type RouteInfo, RouteMeta, RouteModule, RouteSchema, SchemaCompiler, Services, ShutdownManager, type ShutdownOptions, type ShutdownState, type SsrConfig, type SsrRenderFn, type SsrRenderResult, UnauthorizedError, type ValidationError, ValidationFailedError, type WebSocketHandler, type WsUpgradeRequest, assertStrongSecret, buildKozoApp, buildNativeContext, compileRouteHandler, createInflightTracker, createKozo, createOpenAPIGenerator, createRouter, createShutdownManager, createSsrServer, defineEnv, defineKozoApp, defineRoutes, deletedSchema, fastCL, fastWrite400, fastWrite404, fastWrite500, fastWriteError, fastWriteHtml, fastWriteJson, fastWriteJsonStatus, fastWriteText, fileToPath, forbiddenResponse, formatZodErrors, generateSwaggerHtml, generateTypedClient, idParams, internalErrorResponse, isKnownWeakSecret, isMiddlewareFile, isRouteFile, notFoundResponse, paginate, paginationSchema, renderKozoTypesDts, requireSecret, resolveRouteModule, scanMiddleware, scanRoutes, searchSchema, secretByteLength, sortSchema, successSchema, timestamps, trackRequest, unauthorizedResponse, uuid, uuidParams, validationErrorResponse };
