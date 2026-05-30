import * as hono from 'hono';
import { Context, Next, Hono } from 'hono';

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

export { type CorsOptions, type FileSystemRoutingOptions, type LoggerOptions, type ManifestHttpMethod, type ManifestRoute, type RateLimitOptions, type RateLimitStore, type RateLimitStoreRecord, type RoutesManifest, type WebhookVerifyOptions, applyFileSystemRouting, clearRateLimitStore, cors, createFileSystemRouting, errorHandler, logger, rateLimit, verifyWebhookSignature };
