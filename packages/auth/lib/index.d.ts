import * as hono from 'hono';
import { Context, Next } from 'hono';
import { JWTVerifyGetKey } from 'jose';
import { KozoEnv, KozoUser, KozoGuard } from '@kozojs/core';
export { GuardRequest, KozoError, KozoGuard, KozoUser, UnauthorizedError } from '@kozojs/core';

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
     * a separate enforcement middleware (e.g. `registerAuthBeforeLoadRoutes` or a custom enforce step).
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
/** Options for {@link registerAuthBeforeLoadRoutes}. */
interface RegisterAuthOptions extends AuthOptions {
    /** Same `routesDir` passed to `createKozo({ routesDir })` — used to scan `meta.auth: false`. */
    routesDir: string;
    /**
     * Additional paths that bypass JWT authentication regardless of `meta.auth`.
     * @example ['/api/docs', '/api/health']
     */
    extraPublicPaths?: string[];
}
/**
 * Registers JWT middleware **before** `app.loadRoutes()`.
 *
 * Use this when routes (or `_middleware.ts` files) depend on `c.get('user')` /
 * `ctx.user` — e.g. admin role guards. Middleware registered **after** `loadRoutes()`
 * runs **after** directory `_middleware.ts`, so JWT would not populate the user in time.
 *
 * @deprecated Use {@link registerAuthGuard} instead — same API and semantics,
 * but registered as a transport-agnostic guard (`app.guard`): under
 * `nativeListen()` it runs on the uWS native fast path, while this middleware
 * version forces every covered route through the Hono bridge (~35% slower).
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

/** Options for {@link jwtGuard}. */
interface JwtGuardOptions {
    /**
     * Paths that bypass authentication (exact match or prefix — '/api/docs'
     * also matches '/api/docs/anything').
     */
    publicPaths?: Iterable<string>;
    /** Allowed JWT algorithms. Defaults to HS256/HS384/HS512. */
    allowedAlgorithms?: string[];
    /** Claims that must equal the given values for the token to be accepted. */
    expectedClaims?: Record<string, unknown>;
    /** Custom key resolver for asymmetric algorithms. */
    getKey?: JWTVerifyGetKey;
}
/**
 * JWT authentication as a transport-agnostic guard for `app.guard()`.
 *
 * Mirrors `registerAuthBeforeLoadRoutes` semantics: public paths pass without
 * a token, everything else requires a valid Bearer token. On success the
 * decoded payload is attached as the user (visible to later guards via
 * `req.user` and to handlers via `ctx.user`).
 *
 * @example
 * app.guard('/api/*', jwtGuard(process.env.JWT_SECRET!, {
 *   publicPaths: ['/api/health', '/api/docs'],
 * }));
 */
declare function jwtGuard(secretOrPublicKey: string | Uint8Array, options?: JwtGuardOptions): KozoGuard;
/**
 * Role check as a guard. Run it AFTER `jwtGuard` in the chain — it reads the
 * user attached by the previous guard. 401 when unauthenticated, 403 when the
 * role does not match. Checks `user.role` (string) and `user.roles` (array).
 *
 * @example
 * app.guard('/api/*', jwtGuard(secret, { publicPaths }));
 * app.guard('/api/admin/*', roleGuard('admin'));
 */
declare function roleGuard(role: string | string[]): KozoGuard;
/** Structural interface for apps exposing `guard()` (i.e. `Kozo`). */
interface KozoGuardAppLike {
    guard(pattern: string, guard: KozoGuard): unknown;
}
/**
 * Guard-based equivalent of {@link registerAuthBeforeLoadRoutes}: scans the
 * routes directory for `meta.auth: false` and registers a single `jwtGuard`
 * on `${prefix}/*`. Routes keep the uWS native fast path under
 * `nativeListen()` — this is the recommended setup for native apps.
 *
 * @example
 * await registerAuthGuard(app, process.env.JWT_SECRET!, {
 *   routesDir: './src/routes',
 *   extraPublicPaths: ['/api/docs', '/api/docs.json'],
 * });
 * await app.loadRoutes();
 */
declare function registerAuthGuard(app: KozoGuardAppLike, secretOrPublicKey: string | Uint8Array, options: RegisterAuthOptions): Promise<void>;
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

export { type AuthOptions, type Guard, type JwtGuardOptions, type KozoAppLike, type KozoGuardAppLike, type RegisterAuthOptions, anyOf, authenticateJWT, canActivate, createJWT, decodeJWT, decodeTokenPayload, getUser, hasRole, isAuthenticated, isSelf, jwtGuard, registerAuthBeforeLoadRoutes, registerAuthGuard, roleGuard };
