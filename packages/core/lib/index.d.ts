import * as hono from 'hono';
import { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono/quick';
import { IncomingMessage, ServerResponse, Server } from 'node:http';
import { z } from 'zod';
export { z } from 'zod';
import { Writable } from 'node:stream';
export { CorsOptions, FileSystemRoutingOptions, LoggerOptions, ManifestHttpMethod, ManifestRoute, RateLimitOptions, RateLimitStore, RateLimitStoreRecord, RoutesManifest, WebhookVerifyOptions, applyFileSystemRouting, clearRateLimitStore, cors, createFileSystemRouting, errorHandler, logger, rateLimit, verifyWebhookSignature } from './middleware/index.js';

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
interface RouteModule<S extends RouteSchema = RouteSchema> {
    default: KozoHandler<S>;
    schema?: S;
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
type HttpMethod$1 = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface RouteDefinition {
    path: string;
    method: HttpMethod$1;
    filePath: string;
    module: RouteModule;
}
interface OpenAPIConfigRef {
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    tags?: Array<{
        name: string;
        description?: string;
    }>;
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
    origin?: string;
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

interface Plugin {
    name: string;
    version?: string;
    install: (app: Kozo<Services>) => void | Promise<void>;
}
/**
 * A route sub-router that prepends a fixed prefix to every registered path.
 * Created via `app.group('/prefix', (r) => { r.get('/...', handler) })`.
 */
declare class KozoGroup<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>> {
    private readonly prefix;
    private readonly parent;
    constructor(prefix: string, parent: Kozo<TServices, TScoped>);
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
}
/**
 * Kozo - High-performance TypeScript framework with Zod schemas
 *
 * @typeParam TServices - Shape of the services object injected into every handler.
 *   Pass it once at construction: `createKozo<{ db: Database }>({ services: { db } })`
 *   and all handler contexts will have `ctx.services.db` fully typed.
 */
declare class Kozo<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>> {
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
    /** Normalize bare Zod response schema → { 200: schema } for OpenAPI generators */
    private static normalizeSchema;
    constructor(config?: KozoConfig<TServices, TScoped>);
    use(plugin: Plugin): this;
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
    group(prefix: string, fn: (router: KozoGroup<TServices>) => void): this;
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
    listen(port?: number): Promise<void>;
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
     * @example
     * app.middleware('/api/*', async (c, next) => {
     *   c.set('user', await verifyJwt(c.req.header('authorization')));
     *   return next();
     * });
     */
    middleware(handler: MiddlewareHandler<KozoEnv>): this;
    middleware(path: string, handler: MiddlewareHandler<KozoEnv>): this;
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
    get fetch(): (request: Request, Env?: unknown, executionCtx?: hono.ExecutionContext) => Response | Promise<Response>;
}
declare function createKozo<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>>(config?: KozoConfig<TServices, TScoped>): Kozo<TServices, TScoped>;

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
type CompiledHandler = (c: Context) => Promise<Response> | Response;
type UserHandler = (c: any) => any;
type CompiledRoute = {
    validateBody?: ZValidator;
    validateQuery?: ZValidator;
    validateParams?: ZValidator;
    serialize?: (data: any) => string;
};
declare class SchemaCompiler {
    static compile(schema: RouteSchema): CompiledRoute;
}
declare function compileRouteHandler(handler: UserHandler, schema: RouteSchema, services: Services, compiled: CompiledRoute, scope?: AnyScopeConfig): CompiledHandler;

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

export { BadRequestError, type ClientGeneratorOptions, type CompiledRoute, ConflictError, ERROR_RESPONSES, ForbiddenError, GoneError, type Infer, type InferResponse, type InferSchema, type InflightTracker, Kozo, type KozoConfig, type KozoContext, type KozoEnv, KozoError, KozoGroup, type KozoHandler, type KozoRequest, type KozoUser, type KozoWebSocket, type MiddlewareDefinition, type NativeKozoContext, type NativeKozoHandler, NotFoundError, type OpenAPIConfig, OpenAPIGenerator, type OpenAPIInfo, type OpenAPISpec, type PaginatedResult, type Plugin, type ProblemDetails, type RouteInfo, type RouteMeta, type RouteModule, type RouteSchema, SchemaCompiler, type Services, ShutdownManager, type ShutdownOptions, type ShutdownState, type SsrConfig, type SsrRenderFn, type SsrRenderResult, UnauthorizedError, type ValidationError, ValidationFailedError, type WebSocketHandler, type WsUpgradeRequest, buildNativeContext, compileRouteHandler, createInflightTracker, createKozo, createOpenAPIGenerator, createShutdownManager, createSsrServer, defineEnv, deletedSchema, fastCL, fastWrite400, fastWrite404, fastWrite500, fastWriteError, fastWriteHtml, fastWriteJson, fastWriteJsonStatus, fastWriteText, fileToPath, forbiddenResponse, formatZodErrors, generateSwaggerHtml, generateTypedClient, idParams, internalErrorResponse, isMiddlewareFile, isRouteFile, notFoundResponse, paginate, paginationSchema, scanMiddleware, scanRoutes, searchSchema, sortSchema, successSchema, timestamps, trackRequest, unauthorizedResponse, uuid, uuidParams, validationErrorResponse };
