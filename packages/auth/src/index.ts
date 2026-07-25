/**
 * Kozo Auth - JWT Authentication Middleware
 * 
 * Provides JWT authentication middleware for the Kozo framework.
 * Uses the jose library for fast and secure JWT verification.
 */

import { jwtVerify, decodeJwt, type JWTVerifyGetKey } from 'jose';
import type { Context, Next } from 'hono';
import { assertStrongSecret } from '@kozojs/core';
import type { KozoEnv } from '@kozojs/core';

export { KozoError, UnauthorizedError, type KozoUser } from '@kozojs/core';

/**
 * Refuse a secret that Kozo itself has published, or one too short to be worth
 * an HMAC, before the middleware or guard is built.
 *
 * Deliberately construction-time: a process that will not boot is a deploy
 * failure someone fixes in minutes, whereas one that boots and 401s every
 * request looks like an application bug and gets debugged for an hour.
 *
 * String and raw byte keys both need enough entropy for HMAC. A `getKey`
 * resolver means the secret argument is unused (asymmetric verification), so
 * checking it would reject a valid configuration.
 */
function guardSecret(
  secretOrPublicKey: string | Uint8Array,
  getKey: JWTVerifyGetKey | undefined,
  source: string,
): void {
  if (getKey) return;

  // Reading the variable with a non-null assertion used to be the documented
  // pattern, and the assertion is a compile-time claim the runtime does not
  // honour: an unset variable arrives here as `undefined`, and TextEncoder
  // would turn it into a nine-byte key spelling "undefined". Do not trust
  // the declared type.
  if (secretOrPublicKey === undefined || secretOrPublicKey === null) {
    throw new Error(
      `[Kozo] ${source} received no secret — the environment variable it reads is unset.\n` +
        `  Use requireSecret('JWT_SECRET') from @kozojs/core, which fails here instead of signing with nothing.`,
    );
  }

  assertStrongSecret(secretOrPublicKey, { source });
}

/**
 * Authentication options
 */
export interface AuthOptions {
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
 * Default token extractor - gets Bearer token from Authorization header
 */
function defaultGetToken(c: Context): string | undefined {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return undefined;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return undefined;
  }
  
  return parts[1];
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
 * import { Kozo, requireSecret } from '@kozojs/core';
 * import { authenticateJWT } from '@kozojs/auth';
 *
 * const app = new Kozo();
 *
 * // Protect /api routes with JWT. requireSecret() refuses to start without
 * // a real JWT_SECRET, rather than falling back to a literal.
 * app.use('/*', authenticateJWT(requireSecret('JWT_SECRET')));
 *
 * // Use with custom options
 * app.use('/*', authenticateJWT(publicKey, {
 *   prefix: '/api',
 *   getKey: async (header) => getKeyFromJWKS(header.kid)
 * }));
 * ```
 *
 * @throws when `secretOrPublicKey` is a string that Kozo has published as a
 * placeholder, or (under `NODE_ENV=production`) is shorter than 32 bytes.
 * The check runs here, at construction — never per request.
 */
export function authenticateJWT(
  secretOrPublicKey: string | Uint8Array,
  opts: AuthOptions = {}
) {
  const {
    prefix = '/api',
    getToken = defaultGetToken,
    getKey,
    expectedClaims,
    allowedAlgorithms = ['HS256', 'HS384', 'HS512'] as string[],
    optional = false,
  } = opts;

  // Fail the boot, not request #1, on a secret that cannot protect anything.
  guardSecret(secretOrPublicKey, getKey, 'authenticateJWT(secret)');

  // Convert secret to Uint8Array if it's a string
  const key = typeof secretOrPublicKey === 'string'
    ? new TextEncoder().encode(secretOrPublicKey)
    : secretOrPublicKey;

  return async (c: Context<KozoEnv>, next: Next) => {
    // Skip non-matching paths if prefix is set
    if (prefix !== '') {
      const path = c.req.path;
      if (!path.startsWith(prefix)) {
        return next();
      }
    }

    // Extract token
    const token = getToken(c);
    
    if (!token) {
      if (optional) return next();
      return c.json({ 
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing authentication token'
      }, 401);
    }

    try {
      // Verify the JWT
      const verifyOpts = { algorithms: allowedAlgorithms };
      const { payload } = getKey
        ? await jwtVerify(token, getKey, verifyOpts)
        : await jwtVerify(token, key, verifyOpts);

      // Validate expected claims if provided
      if (expectedClaims) {
        for (const [claim, value] of Object.entries(expectedClaims)) {
          if (payload[claim] !== value) {
            return c.json({
              type: 'about:blank',
              title: 'Unauthorized',
              status: 401,
              detail: `Invalid claim: ${claim}`
            }, 401);
          }
        }
      }

      // Set the decoded user on the context
      c.set('user', payload);

      await next();
    } catch (error: any) {
      // Determine error message
      let detail = 'Invalid or expired token';
      
      if (error.code) {
        switch (error.code) {
          case 'ERR_JWT_EXPIRED':
            detail = 'Token has expired';
            break;
          case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
            detail = 'Invalid token signature';
            break;
          case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
            detail = error.message || 'Token claim validation failed';
            break;
        }
      }

      return c.json({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail
      }, 401);
    }
  };
}

/**
 * Utility to create a JWT (for testing or internal use)
 * Note: This is a simple HMAC-based JWT creator. For production,
 * consider using a more complete solution.
 */
export async function createJWT(
  payload: Record<string, unknown>,
  secret: string,
  options: {
    expiresIn?: string | number;
    algorithm?: 'HS256' | 'HS384' | 'HS512';
  } = {}
): Promise<string> {
  const { SignJWT } = await import('jose');

  assertStrongSecret(secret, { source: 'createJWT(secret)' });
  const key = new TextEncoder().encode(secret);

  return new SignJWT(payload)
    .setProtectedHeader({ alg: options.algorithm || 'HS256' })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn || '1h')
    .sign(key);
}

/**
 * Decode JWT without verification (for inspection)
 */
export function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    return decodeJwt(token) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ============================================
// USER CONTEXT HELPERS
// ============================================

import type { KozoUser } from '@kozojs/core';

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
export function getUser(c: Context): KozoUser | null {
  try {
    return (c as any).get('user') as KozoUser ?? null;
  } catch {
    return null;
  }
}

// ============================================
// GUARDS (canActivate pattern)
// ============================================

/**
 * A guard is a function that receives the Hono context and returns:
 * - `true`  → allow the request
 * - `false` → reject with 403 Forbidden
 * - A `Response` → return that response directly (custom error / redirect)
 */
export type Guard = (c: Context<any>) => boolean | Response | Promise<boolean | Response>;

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
export function canActivate(...guards: Guard[]) {
  return async (c: Context<any>, next: Next) => {
    for (const guard of guards) {
      const result = await guard(c);
      if (result === true) continue;
      if (result === false) {
        return c.json({
          type: 'https://kozo-docs.vercel.app/docs/core/errors#forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You do not have permission to access this resource',
        }, 403);
      }
      // Custom Response returned by guard
      return result;
    }
    return next();
  };
}

// ============================================
// BUILT-IN GUARDS
// ============================================

/**
 * Guard: requires a valid authenticated user in context.
 * Use after `authenticateJWT` middleware.
 *
 * @example
 * app.use('/api/*', authenticateJWT(secret));
 * app.use('/api/profile', canActivate(isAuthenticated));
 */
export const isAuthenticated: Guard = (c) => {
  const user = getUser(c);
  if (!user) {
    return c.json({
      type: 'https://kozo-docs.vercel.app/docs/core/errors#unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Authentication required',
    }, 401) as Response;
  }
  return true;
};

/**
 * Guard factory: requires the user to have a specific role (or one of many roles).
 * Checks `user.role` (string) and `user.roles` (string[]).
 *
 * @example
 * app.use('/admin/*', canActivate(isAuthenticated, hasRole('admin')));
 * app.use('/content', canActivate(isAuthenticated, hasRole(['editor', 'admin'])));
 */
export function hasRole(role: string | string[]): Guard {
  const allowed = Array.isArray(role) ? role : [role];
  return (c) => {
    const user = getUser(c);
    if (!user) return false;

    const userRole  = typeof user.role  === 'string' ? user.role  : null;
    const userRoles = Array.isArray(user.roles)       ? user.roles : [];

    const hasMatch = allowed.some(r => r === userRole || userRoles.includes(r));
    return hasMatch;
  };
}

/**
 * Guard factory: requires the authenticated user's `sub` (or `id`) to match
 * the `:id` path param. Prevents users from accessing other users' resources.
 *
 * @example
 * app.use('/users/:id/*', canActivate(isAuthenticated, isSelf));
 * // GET /users/abc123/profile → only user with sub='abc123' can access
 */
export const isSelf: Guard = (c) => {
  const user = getUser(c);
  if (!user) return false;
  const paramId = c.req.param('id');
  // Never compare two possibly-undefined values: on a route without an `:id`
  // param `paramId` is undefined, and a token payload lacking `sub`/`id` would
  // otherwise yield `undefined === undefined` → access granted (F-02). Both the
  // param and the identity claim must be present, non-empty strings.
  if (typeof paramId !== 'string' || paramId === '') return false;
  const sub = typeof user.sub === 'string' && user.sub !== '' ? user.sub : null;
  const id = typeof (user as any).id === 'string' && (user as any).id !== '' ? (user as any).id : null;
  return sub === paramId || id === paramId;
};

/**
 * Guard combinator: passes if ANY of the provided guards returns `true`.
 * Useful for "admin OR self" patterns.
 *
 * @example
 * app.use('/users/:id', canActivate(anyOf(hasRole('admin'), isSelf)));
 */
export function anyOf(...guards: Guard[]): Guard {
  return async (c) => {
    for (const guard of guards) {
      const result = await guard(c);
      if (result === true) return true;
    }
    return false;
  };
}

/** A minimal structural interface matching what `Kozo` exposes. */
export interface KozoAppLike {
  getRoutes(): ReadonlyArray<{ path: string; meta?: { auth?: boolean } }>;
  middleware(path: string, fn: (c: Context<KozoEnv>, next: Next) => Promise<Response | void>): void;
}

/** Options for {@link registerAuthBeforeLoadRoutes}. */
export interface RegisterAuthOptions extends AuthOptions {
  /** Same `routesDir` passed to `createKozo({ routesDir })` — used to scan `meta.auth: false`. */
  routesDir: string;
  /**
   * Additional paths that bypass JWT authentication regardless of `meta.auth`.
   * @example ['/api/docs', '/api/health']
   */
  extraPublicPaths?: string[];
}

function isPublicPath(pathname: string, publicPaths: ReadonlySet<string>): boolean {
  for (const p of publicPaths) {
    if (pathname === p || pathname.startsWith(p + '/')) return true;
  }
  return false;
}

async function collectPublicPaths(routesDir: string, extraPublicPaths: string[]): Promise<Set<string>> {
  const { scanRoutes, resolveRouteModule } = await import('@kozojs/core');
  const scanned = await scanRoutes({ routesDir, verbose: false });
  return new Set([
    ...extraPublicPaths,
    ...scanned
      .filter((r) => resolveRouteModule(r.module)?.meta?.auth === false)
      .map((r) => r.path),
  ]);
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
 * await registerAuthBeforeLoadRoutes(app, requireSecret('JWT_SECRET'), {
 *   routesDir: './src/routes',
 *   prefix: '/api',
 *   extraPublicPaths: ['/api/docs', '/api/docs.json'],
 * });
 * await app.loadRoutes();
 */
export async function registerAuthBeforeLoadRoutes(
  app: KozoAppLike,
  secretOrPublicKey: string | Uint8Array,
  options: RegisterAuthOptions,
): Promise<void> {
  const { routesDir, extraPublicPaths = [], prefix = '/api', ...authOpts } = options;
  const publicPaths = await collectPublicPaths(routesDir, extraPublicPaths);
  const jwtFn = authenticateJWT(secretOrPublicKey, { ...authOpts, prefix: '' });

  app.middleware(`${prefix}/*`, authenticateJWT(secretOrPublicKey, { optional: true, prefix: '', ...authOpts }));
  app.middleware(`${prefix}/*`, async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (isPublicPath(pathname, publicPaths)) return next();
    return jwtFn(c, next);
  });
}

// ============================================
// TRANSPORT-AGNOSTIC GUARDS (app.guard)
// ============================================
//
// Guard variants of the JWT middleware. Registered via `app.guard()` they run
// on the uWS native fast path under `nativeListen()` (no Hono bridge) AND as
// regular Hono middleware under `listen()` — same security, native speed.

import type { KozoGuard, GuardRequest } from '@kozojs/core';

export type { KozoGuard, GuardRequest } from '@kozojs/core';

const UNAUTHORIZED = (detail: string) => ({
  deny: {
    status: 401,
    body: { type: 'about:blank', title: 'Unauthorized', status: 401, detail },
  },
});

function jwtErrorDetail(error: any): string {
  switch (error?.code) {
    case 'ERR_JWT_EXPIRED': return 'Token has expired';
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED': return 'Invalid token signature';
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED': return error.message || 'Token claim validation failed';
    default: return 'Invalid or expired token';
  }
}

/** Options for {@link jwtGuard}. */
export interface JwtGuardOptions {
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
 * app.guard('/api/*', jwtGuard(requireSecret('JWT_SECRET'), {
 *   publicPaths: ['/api/health', '/api/docs'],
 * }));
 */
export function jwtGuard(
  secretOrPublicKey: string | Uint8Array,
  options: JwtGuardOptions = {},
): KozoGuard {
  const {
    publicPaths,
    allowedAlgorithms = ['HS256', 'HS384', 'HS512'],
    expectedClaims,
    getKey,
  } = options;

  // Fail the boot, not request #1, on a secret that cannot protect anything.
  guardSecret(secretOrPublicKey, getKey, 'jwtGuard(secret)');

  const key = typeof secretOrPublicKey === 'string'
    ? new TextEncoder().encode(secretOrPublicKey)
    : secretOrPublicKey;
  const publicSet = publicPaths ? new Set(publicPaths) : null;

  return async (req: GuardRequest) => {
    const isPublic = publicSet !== null && isPublicPath(req.path, publicSet);

    const authHeader = req.header('authorization');
    let token: string | undefined;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer') token = parts[1];
    }

    if (!token) {
      return isPublic ? undefined : UNAUTHORIZED('Missing authentication token');
    }

    try {
      const verifyOpts = { algorithms: allowedAlgorithms };
      const { payload } = getKey
        ? await jwtVerify(token, getKey, verifyOpts)
        : await jwtVerify(token, key, verifyOpts);

      if (expectedClaims) {
        for (const [claim, value] of Object.entries(expectedClaims)) {
          if (payload[claim] !== value) return UNAUTHORIZED(`Invalid claim: ${claim}`);
        }
      }
      return { user: payload };
    } catch (error: any) {
      // A present-but-invalid token is rejected even on public paths,
      // matching authenticateJWT({ optional: true }) behavior.
      return UNAUTHORIZED(jwtErrorDetail(error));
    }
  };
}

/**
 * Role check as a guard. Run it AFTER `jwtGuard` in the chain — it reads the
 * user attached by the previous guard. 401 when unauthenticated, 403 when the
 * role does not match. Checks `user.role` (string) and `user.roles` (array).
 *
 * @example
 * app.guard('/api/*', jwtGuard(secret, { publicPaths }));
 * app.guard('/api/admin/*', roleGuard('admin'));
 */
export function roleGuard(role: string | string[]): KozoGuard {
  const allowed = Array.isArray(role) ? role : [role];
  return (req: GuardRequest) => {
    const user = req.user as KozoUser | null;
    if (!user) {
      return {
        deny: {
          status: 401,
          body: {
            type: 'https://kozo-docs.vercel.app/docs/core/errors#unauthorized',
            title: 'Unauthorized',
            status: 401,
            detail: 'Authentication required',
          },
        },
      };
    }
    const userRole = typeof user.role === 'string' ? user.role : null;
    const userRoles = Array.isArray(user.roles) ? user.roles : [];
    if (allowed.some((r) => r === userRole || userRoles.includes(r))) return;
    return {
      deny: {
        status: 403,
        body: {
          type: 'https://kozo-docs.vercel.app/docs/core/errors#forbidden',
          title: 'Forbidden',
          status: 403,
          detail: 'You do not have permission to access this resource',
        },
      },
    };
  };
}

/** Structural interface for apps exposing `guard()` (i.e. `Kozo`). */
export interface KozoGuardAppLike {
  guard(pattern: string, guard: KozoGuard): unknown;
}

/**
 * Guard-based equivalent of {@link registerAuthBeforeLoadRoutes}: scans the
 * routes directory for `meta.auth: false` and registers a single `jwtGuard`
 * on `${prefix}/*`. Routes keep the uWS native fast path under
 * `nativeListen()` — this is the recommended setup for native apps.
 *
 * @example
 * await registerAuthGuard(app, requireSecret('JWT_SECRET'), {
 *   routesDir: './src/routes',
 *   extraPublicPaths: ['/api/docs', '/api/docs.json'],
 * });
 * await app.loadRoutes();
 */
export async function registerAuthGuard(
  app: KozoGuardAppLike,
  secretOrPublicKey: string | Uint8Array,
  options: RegisterAuthOptions,
): Promise<void> {
  const { routesDir, extraPublicPaths = [], prefix = '/api', getToken: _ignored, optional: _ignored2, ...rest } = options;
  const publicPaths = await collectPublicPaths(routesDir, extraPublicPaths);
  app.guard(`${prefix}/*`, jwtGuard(secretOrPublicKey, {
    publicPaths,
    allowedAlgorithms: rest.allowedAlgorithms,
    expectedClaims: rest.expectedClaims,
    getKey: rest.getKey,
  }));
}

/**
 * Decode a JWT token payload without verifying its signature.
 * Safe for client-side use to inspect claims (e.g. displaying user info in the UI).
 * Never use this for authorization — always verify the signature server-side.
 *
 * @example
 * const payload = decodeTokenPayload(token);
 * console.log(payload?.email, payload?.role);
 */
export function decodeTokenPayload<T extends KozoUser = KozoUser>(token: string): T | null {
  const payload = decodeJWT(token);
  return payload as T | null;
}
