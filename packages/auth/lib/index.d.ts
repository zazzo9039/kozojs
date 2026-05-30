import * as hono from 'hono';
import { Context, Next } from 'hono';
import { JWTVerifyGetKey } from 'jose';
import { KozoEnv, KozoUser } from '@kozojs/core';
export { KozoError, KozoUser, UnauthorizedError } from '@kozojs/core';

/**
 * Authentication options
 */
interface AuthOptions {
    /**
     * URL path prefix to protect. Defaults to '/api'.
     * Set to empty string '' to protect all routes.
     */
    prefix?: string;
    /**
     * Custom function to extract the token from the request.
     * By default, extracts from Authorization header (Bearer token).
     */
    getToken?: (c: Context) => string | undefined;
    /**
     * Custom key function for JWT verification.
     * Use this for RS256 or other asymmetric algorithms.
     */
    getKey?: JWTVerifyGetKey;
    /**
     * Expected JWT payload schema (optional validation).
     * If provided, the decoded payload will be validated against this schema.
     */
    expectedClaims?: Record<string, unknown>;
    /**
     * Whether to require the 'alg' header to be in a specific set.
     * Defaults to ['HS256', 'HS384', 'HS512'] for symmetric algorithms.
     */
    allowedAlgorithms?: string[];
    /**
     * When true, the middleware will not return 401 if no token is provided.
     * The user context will be null. Use this as a soft pre-decode step before
     * a separate enforcement middleware (e.g. via `setupAuth`).
     */
    optional?: boolean;
}
/**
 * Create JWT authentication middleware
 *
 * @param secretOrPublicKey - Secret for HMAC algorithms, or public key for RSA/ECDSA
 * @param opts - Authentication options
 * @returns Hono middleware function
 *
 * @example
 * ```ts
 * import { Kozo } from '@kozojs/core';
 * import { authenticateJWT } from '@kozojs/auth';
 *
 * const app = new Kozo();
 *
 * // Protect /api routes with JWT
 * app.use('/*', authenticateJWT('my-secret-key'));
 *
 * // Use with custom options
 * app.use('/*', authenticateJWT(publicKey, {
 *   prefix: '/api',
 *   getKey: async (header) => getKeyFromJWKS(header.kid)
 * }));
 * ```
 */
declare function authenticateJWT(secretOrPublicKey: string | Uint8Array, opts?: AuthOptions): (c: Context<KozoEnv>, next: Next) => Promise<void | (Response & hono.TypedResponse<{
    type: string;
    title: string;
    status: number;
    detail: string;
}, 401, "json">)>;
/**
 * Utility to create a JWT (for testing or internal use)
 * Note: This is a simple HMAC-based JWT creator. For production,
 * consider using a more complete solution.
 */
declare function createJWT(payload: Record<string, unknown>, secret: string, options?: {
    expiresIn?: string | number;
    algorithm?: 'HS256' | 'HS384' | 'HS512';
}): Promise<string>;
/**
 * Decode JWT without verification (for inspection)
 */
declare function decodeJWT(token: string): Record<string, unknown> | null;

/**
 * Get the authenticated user from the Hono context.
 * Returns null if not authenticated.
 *
 * @example
 * app.get('/me', async (c) => {
 *   const user = getUser(c);
 *   if (!user) throw new UnauthorizedError();
 *   return user;
 * });
 */
declare function getUser(c: Context): KozoUser | null;
/**
 * A guard is a function that receives the Hono context and returns:
 * - `true`  → allow the request
 * - `false` → reject with 403 Forbidden
 * - A `Response` → return that response directly (custom error / redirect)
 */
type Guard = (c: Context<any>) => boolean | Response | Promise<boolean | Response>;
/**
 * Wrap a Hono middleware handler with one or more guards.
 * Guards are evaluated in order — first failure stops the chain.
 *
 * Use with `app.use()` to protect routes or groups.
 *
 * @example
 * import { canActivate, isAuthenticated, hasRole } from '@kozojs/auth';
 *
 * // Protect all /admin routes
 * app.use('/admin/*', canActivate(isAuthenticated, hasRole('admin')));
 *
 * // Protect a single route
 * app.get('/dashboard', canActivate(isAuthenticated), handler);
 */
declare function canActivate(...guards: Guard[]): (c: Context<any>, next: Next) => Promise<void | Response>;
/**
 * Guard: requires a valid authenticated user in context.
 * Use after `authenticateJWT` middleware.
 *
 * @example
 * app.use('/api/*', authenticateJWT(secret));
 * app.use('/api/profile', canActivate(isAuthenticated));
 */
declare const isAuthenticated: Guard;
/**
 * Guard factory: requires the user to have a specific role (or one of many roles).
 * Checks `user.role` (string) and `user.roles` (string[]).
 *
 * @example
 * app.use('/admin/*', canActivate(isAuthenticated, hasRole('admin')));
 * app.use('/content', canActivate(isAuthenticated, hasRole(['editor', 'admin'])));
 */
declare function hasRole(role: string | string[]): Guard;
/**
 * Guard factory: requires the authenticated user's `sub` (or `id`) to match
 * the `:id` path param. Prevents users from accessing other users' resources.
 *
 * @example
 * app.use('/users/:id/*', canActivate(isAuthenticated, isSelf));
 * // GET /users/abc123/profile → only user with sub='abc123' can access
 */
declare const isSelf: Guard;
/**
 * Guard combinator: passes if ANY of the provided guards returns `true`.
 * Useful for "admin OR self" patterns.
 *
 * @example
 * app.use('/users/:id', canActivate(anyOf(hasRole('admin'), isSelf)));
 */
declare function anyOf(...guards: Guard[]): Guard;
/** A minimal structural interface matching what `Kozo` exposes. */
interface KozoAppLike {
    getRoutes(): ReadonlyArray<{
        path: string;
        meta?: {
            auth?: boolean;
        };
    }>;
    middleware(path: string, fn: (c: Context<KozoEnv>, next: Next) => Promise<Response | void>): void;
}
interface SetupAuthOptions extends AuthOptions {
    /**
     * Additional paths that bypass JWT authentication regardless of `meta.auth`.
     * @example ['/api/docs', '/api/health']
     */
    extraPublicPaths?: string[];
}
/** Options for {@link registerAuthBeforeLoadRoutes}. */
interface RegisterAuthOptions extends SetupAuthOptions {
    /** Same `routesDir` passed to `createKozo({ routesDir })` — used to scan `meta.auth: false`. */
    routesDir: string;
}
/**
 * Registers JWT middleware **before** `app.loadRoutes()`.
 *
 * Use this when routes (or `_middleware.ts` files) depend on `c.get('user')` /
 * `ctx.user` — e.g. admin role guards. Middleware registered after `loadRoutes()`
 * (including {@link setupAuth}) runs **after** directory `_middleware.ts`, so JWT
 * would not populate the user in time.
 *
 * @example
 * await registerAuthBeforeLoadRoutes(app, process.env.JWT_SECRET!, {
 *   routesDir: './src/routes',
 *   prefix: '/api',
 *   extraPublicPaths: ['/api/docs', '/api/docs.json'],
 * });
 * await app.loadRoutes();
 */
declare function registerAuthBeforeLoadRoutes(app: KozoAppLike, secretOrPublicKey: string | Uint8Array, options: RegisterAuthOptions): Promise<void>;
/**
 * One-call JWT authentication setup that automatically respects `meta: { auth: false }`.
 *
 * @deprecated Prefer {@link registerAuthBeforeLoadRoutes} before `loadRoutes()` when
 * directory `_middleware.ts` files check `user.role`. This API registers JWT **after**
 * `loadRoutes()` and will be kept for backward compatibility only.
 *
 * Call this **after** `app.loadRoutes()`. Safe only when **no** `_middleware.ts` reads
 * `user` before your handler (no role guards). If you use per-directory admin guards,
 * prefer {@link registerAuthBeforeLoadRoutes} **before** `loadRoutes()` instead.
 *
 * @example
 * await app.loadRoutes();
 * setupAuth(app, process.env.JWT_SECRET!, {
 *   prefix: '/api',
 *   extraPublicPaths: ['/api/docs', '/api/docs.json'],
 * });
 */
declare function setupAuth(app: KozoAppLike, secretOrPublicKey: string | Uint8Array, options?: SetupAuthOptions): void;
/**
 * Decode a JWT token payload without verifying its signature.
 * Safe for client-side use to inspect claims (e.g. displaying user info in the UI).
 * Never use this for authorization — always verify the signature server-side.
 *
 * @example
 * const payload = decodeTokenPayload(token);
 * console.log(payload?.email, payload?.role);
 */
declare function decodeTokenPayload<T extends KozoUser = KozoUser>(token: string): T | null;

export { type AuthOptions, type Guard, type KozoAppLike, type RegisterAuthOptions, type SetupAuthOptions, anyOf, authenticateJWT, canActivate, createJWT, decodeJWT, decodeTokenPayload, getUser, hasRole, isAuthenticated, isSelf, registerAuthBeforeLoadRoutes, setupAuth };
