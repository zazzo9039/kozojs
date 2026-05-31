// Use hono/quick for guaranteed RegExpRouter (fastest for benchmarks)
// SmartRouter sometimes falls back to TrieRouter on complex patterns
import { Hono } from 'hono/quick';
import type { MiddlewareHandler } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import type { KozoConfig, KozoEnv, Services, RouteSchema, KozoHandler, RouteMeta, HttpMethod } from './types.js';
import type { AnyScopeConfig } from './scoped-services.js';
import { generateTypedClient, type ClientGeneratorOptions, type RouteInfo } from './client-generator.js';
import { compileRouteHandler, compileUwsNativeHandler, SchemaCompiler, DEFAULT_MAX_BODY_BYTES } from './compiler.js';
import { clearRateLimitStore } from './middleware/rate-limit.js';
import { KozoError, internalErrorResponse } from './errors.js';
import { ShutdownManager, type ShutdownOptions } from './shutdown.js';
import { scanRoutes, scanMiddleware, resolveRouteModule } from './router.js';
import { tryLoadUws, createUwsServer, type UwsRouteEntry, type UwsCorsConfig } from './uws-transport.js';
import { createSsrServer, type SsrConfig } from './ssr.js';
import type { WebSocketHandler, WsRouteEntry } from './ws.js';

// Plugin Architecture
export interface Plugin {
  name: string;
  version?: string;
  install: (app: Kozo<Services>) => void | Promise<void>;
}

/**
 * A route sub-router that prepends a fixed prefix to every registered path.
 * Created via `app.group('/prefix', (r) => { r.get('/...', handler) })`.
 */
export class KozoGroup<
  TServices extends Services = Services,
  TScoped extends Record<string, unknown> = Record<string, never>,
> {
  constructor(private readonly prefix: string, private readonly parent: Kozo<TServices, TScoped>) {}

  get(path: string, handler: KozoHandler<{}, TServices>): this;
  get<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  get<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') this.parent.get(this.prefix + path, schemaOrHandler as any);
    else this.parent.get(this.prefix + path, schemaOrHandler, handler!, meta);
    return this;
  }

  post(path: string, handler: KozoHandler<{}, TServices>): this;
  post<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  post<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') this.parent.post(this.prefix + path, schemaOrHandler as any);
    else this.parent.post(this.prefix + path, schemaOrHandler, handler!, meta);
    return this;
  }

  put(path: string, handler: KozoHandler<{}, TServices>): this;
  put<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  put<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') this.parent.put(this.prefix + path, schemaOrHandler as any);
    else this.parent.put(this.prefix + path, schemaOrHandler, handler!, meta);
    return this;
  }

  patch(path: string, handler: KozoHandler<{}, TServices>): this;
  patch<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  patch<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') this.parent.patch(this.prefix + path, schemaOrHandler as any);
    else this.parent.patch(this.prefix + path, schemaOrHandler, handler!, meta);
    return this;
  }

  delete(path: string, handler: KozoHandler<{}, TServices>): this;
  delete<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  delete<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') this.parent.delete(this.prefix + path, schemaOrHandler as any);
    else this.parent.delete(this.prefix + path, schemaOrHandler, handler!, meta);
    return this;
  }
}

/**
 * Kozo - High-performance TypeScript framework with Zod schemas
 *
 * @typeParam TServices - Shape of the services object injected into every handler.
 *   Pass it once at construction: `createKozo<{ db: Database }>({ services: { db } })`
 *   and all handler contexts will have `ctx.services.db` fully typed.
 */
export class Kozo<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>> {
  private app: Hono<KozoEnv>;
  private services: TServices;
  private _scope?: AnyScopeConfig;
  private routes: Array<{ method: HttpMethod; path: string; schema: RouteSchema; meta?: RouteMeta }> = [];
  /** Deferred uWS route data — compiled lazily only when nativeListen() is called. */
  private _deferredUws: Array<{
    method: string; path: string; paramNames: string[];
    handler: any; schema: RouteSchema; compiled: any;
  }> = [];
  private shutdownManager = new ShutdownManager();
  private _routesDir?: string;
  private _wsRoutes: WsRouteEntry[] = [];
  private _onStart?: (ctx: { services: TServices }) => void | Promise<void>;
  private _onStop?: (ctx: { services: TServices }) => void | Promise<void>;
  private _maxBodyBytes: number;

  /** Normalize bare Zod response schema → { 200: schema } for OpenAPI generators */
  private static normalizeSchema(schema: RouteSchema): RouteSchema {
    if (schema.response && typeof (schema.response as any).parse === 'function') {
      return { ...schema, response: { 200: schema.response } as RouteSchema['response'] };
    }
    return schema;
  }

  constructor(config: KozoConfig<TServices, TScoped> = {}) {
    this.app = new Hono<KozoEnv>();
    this.services = (config.services ?? {}) as TServices;
    this._routesDir = config.routesDir;
    this._onStart = config.onStart;
    this._onStop = config.onStop;
    this._maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (config.scopedServices) {
      this._scope = {
        base: this.services,
        factory: config.scopedServices as AnyScopeConfig['factory'],
        onEnd: config.onRequestEnd as AnyScopeConfig['onEnd'],
      };
    }

    // Global Error Handler (RFC 7807 Problem Details)
    this.app.onError((err, c) => {
      // 1. Known Kozo errors (NotFoundError, ForbiddenError, etc.)
      if (err instanceof KozoError) {
        return err.toResponse(c.req.path);
      }

      // 2. Unknown errors (bugs in user code)
      console.error('[Kozo] Unhandled error:', err);
      return internalErrorResponse(err as Error, c.req.path);
    });
  }

  // Plugin system
  use(plugin: Plugin): this {
    plugin.install(this as unknown as Kozo<Services>);
    return this;
  }

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
  async loadRoutes(routesDir?: string): Promise<this> {
    const dir = routesDir ?? this._routesDir;
    if (!dir) return this;

    // 1. Scan and register per-directory middleware BEFORE routes
    const middlewares = await scanMiddleware({ routesDir: dir, verbose: false });
    for (const mw of middlewares) {
      this.app.use(mw.pathPrefix, mw.handler as MiddlewareHandler<KozoEnv>);
    }

    // 2. Scan and register route handlers
    const routes = await scanRoutes({ routesDir: dir, verbose: false });

    // Parallelise dynamic imports + schema compilation across all route files.
    // Registration order is preserved via the original `routes` index so that
    // Hono's route priority (more-specific before catch-all) stays intact.
    const compiled = await Promise.all(
      routes.map(async (route) => {
        const { path, method, module } = route;
        const resolved = resolveRouteModule(module)!;
        const { handler, schema, meta } = resolved;
        const compiledSchema = SchemaCompiler.compile(schema);
        return { path, method, handler, schema, meta, compiledSchema };
      })
    );

    for (const { path, method, handler, schema, meta, compiledSchema } of compiled) {
      const normalizedSchema = Kozo.normalizeSchema(schema);
      const optimizedHandler = compileRouteHandler(
        (ctx: any) => handler(ctx),
        normalizedSchema,
        this.services,
        compiledSchema,
        this._scope,
      );
      this.routes.push({ method: method as HttpMethod, path, schema: normalizedSchema, meta });
      (this.app as any)[method](path, optimizedHandler);

      // Defer uWS route compilation until nativeListen() is called
      const paramNames: string[] = [];
      path.replace(/:([^/]+)/g, (_: string, name: string) => { paramNames.push(name); return name; });
      this._deferredUws.push({ method: method.toUpperCase(), path, paramNames, handler: (ctx: any) => handler(ctx), schema, compiled: compiledSchema });
    }

    return this;
  }

  // Code generation with overloads
  generateClient(baseUrl?: string): string;
  generateClient(options?: ClientGeneratorOptions): string;
  generateClient(baseUrlOrOptions?: string | ClientGeneratorOptions): string {
    const options: ClientGeneratorOptions =
      typeof baseUrlOrOptions === 'string'
        ? { baseUrl: baseUrlOrOptions }
        : baseUrlOrOptions || {};

    const routeInfos: RouteInfo[] = this.routes.map(r => ({
      method: r.method,
      path: r.path,
      schema: r.schema,
    }));

    return generateTypedClient(routeInfos, options);
  }

  get(path: string, handler: KozoHandler<{}, TServices>): this;
  get<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  get<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') return this.register('get', path, {}, schemaOrHandler as KozoHandler<any, any>);
    return this.register('get', path, schemaOrHandler, handler!, meta);
  }

  post(path: string, handler: KozoHandler<{}, TServices>): this;
  post<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  post<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') return this.register('post', path, {}, schemaOrHandler as KozoHandler<any, any>);
    return this.register('post', path, schemaOrHandler, handler!, meta);
  }

  put(path: string, handler: KozoHandler<{}, TServices>): this;
  put<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  put<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') return this.register('put', path, {}, schemaOrHandler as KozoHandler<any, any>);
    return this.register('put', path, schemaOrHandler, handler!, meta);
  }

  patch(path: string, handler: KozoHandler<{}, TServices>): this;
  patch<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  patch<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') return this.register('patch', path, {}, schemaOrHandler as KozoHandler<any, any>);
    return this.register('patch', path, schemaOrHandler, handler!, meta);
  }

  delete(path: string, handler: KozoHandler<{}, TServices>): this;
  delete<S extends RouteSchema>(path: string, schema: S, handler: KozoHandler<S, TServices>, meta?: RouteMeta): this;
  delete<S extends RouteSchema>(path: string, schemaOrHandler: S | KozoHandler<{}, TServices>, handler?: KozoHandler<S, TServices>, meta?: RouteMeta): this {
    if (typeof schemaOrHandler === 'function') return this.register('delete', path, {}, schemaOrHandler as KozoHandler<any, any>);
    return this.register('delete', path, schemaOrHandler, handler!, meta);
  }

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
  group(prefix: string, fn: (router: KozoGroup<TServices>) => void): this {
    fn(new KozoGroup(prefix, this));
    return this;
  }

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
  ws<T = unknown>(path: string, handler: WebSocketHandler<T>): this {
    this._wsRoutes.push({ path, handler });
    return this;
  }

  private register(method: string, path: string, schema: RouteSchema, handler: KozoHandler<any, any>, meta?: RouteMeta): this {
    const normalizedSchema = Kozo.normalizeSchema(schema);
    this.routes.push({ method: method as HttpMethod, path, schema: normalizedSchema, meta });

    // 1. Compile schemas (Zod -> Ajv validators + fast-json-stringify serializer)
    const compiled = SchemaCompiler.compile(normalizedSchema);

    // 2. Generate the optimized Hono handler
    const optimizedHandler = compileRouteHandler(
      handler,
      normalizedSchema,
      this.services,
      compiled,
      this._scope,
    );

    // 3. Register the compiled handler with Hono
    (this.app as any)[method](path, optimizedHandler);

    // 4. Defer uWS native handler compilation until nativeListen() is called
    const paramNames: string[] = [];
    path.replace(/:([^/]+)/g, (_: string, name: string) => { paramNames.push(name); return name; });
    this._deferredUws.push({ method: method.toUpperCase(), path, paramNames, handler, schema: normalizedSchema, compiled });

    return this;
  }

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
  async nativeListen(portOrOptions?: number | { port?: number; cors?: UwsCorsConfig }): Promise<{ port: number; server: Server }> {
    const opts = typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions ?? {});
    const port = opts.port ?? 3000;

    const uwsBindings = await tryLoadUws();
    if (!uwsBindings) {
      throw new Error(
        '[Kozo] uWebSockets.js is required but not installed.\n' +
        'Run: pnpm add uWebSockets.js',
      );
    }

    const manager = this.shutdownManager;

    // Lazy-compile uWS handlers only when nativeListen is actually called
    const uwsRoutes: UwsRouteEntry[] = this._deferredUws.map(r => ({
      method: r.method,
      path: r.path,
      paramNames: r.paramNames,
      handler: compileUwsNativeHandler(r.handler, r.schema, this.services, r.compiled, this._scope),
    }));

    // Clear deferred routes to free memory after compilation
    this._deferredUws.length = 0;

    const result = await createUwsServer({
      uws: uwsBindings,
      routes: uwsRoutes,
      port,
      cors: opts.cors,
      isShuttingDown: () => manager.isShuttingDown(),
      trackRequest: () => manager.trackRequest(),
      wsRoutes: this._wsRoutes.length > 0 ? this._wsRoutes : undefined,
    });

    manager.setServer(result.server as unknown as Server);
    if (this._wsRoutes.length > 0) {
      console.log(`🚀 uWebSockets.js transport active (HTTP + ${this._wsRoutes.length} WebSocket route${this._wsRoutes.length > 1 ? 's' : ''})`);
    } else {
      console.log('🚀 uWebSockets.js transport active (C++ HTTP parser + native radix router)');
    }

    // Run onStart lifecycle hook
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }

    return result as { port: number; server: Server };
  }

  async listen(port?: number): Promise<void> {
    if (this._wsRoutes.length > 0) {
      console.warn('[Kozo] WebSocket routes require nativeListen() (uWebSockets.js). They will be ignored with listen().');
    }
    const finalPort = port ?? 3000;
    const manager = this.shutdownManager;

    // Store original fetch to avoid creating async wrapper per request
    const originalFetch = this.app.fetch as any;

    // Hot-swap fetch only when shutdown starts (not on every request)
    let shutdownStarted = false;
    manager.onShutdownStart(() => {
      shutdownStarted = true;
    });

    const server = serve({
      fetch: (req: Request, ...args: any[]) => {
        // Reject oversized request bodies before they are read
        const contentLength = req.headers.get('content-length');
        if (contentLength !== null && Number(contentLength) > this._maxBodyBytes) {
          return new Response(
            JSON.stringify({
              type: 'about:blank',
              title: 'Content Too Large',
              status: 413,
              detail: `Request body exceeds the ${this._maxBodyBytes}-byte limit`,
            }),
            {
              status: 413,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          );
        }

        // Fast path: normal operation (no async wrapper allocation)
        if (!shutdownStarted) {
          const untrack = manager.trackRequest();
          try {
            return originalFetch(req, ...args);
          } finally {
            untrack();
          }
        }

        // Slow path: shutdown mode - reject new requests
        if (manager.isShuttingDown()) {
          return new Response(
            JSON.stringify({
              type: 'about:blank',
              title: 'Service Unavailable',
              status: 503,
              detail: 'Server is shutting down, please retry later',
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          );
        }

        // Still accepting in-flight requests during graceful shutdown
        const untrack = manager.trackRequest();
        try {
          return originalFetch(req, ...args);
        } finally {
          untrack();
        }
      },
      port: finalPort,
    }) as unknown as Server;

    manager.setServer(server);
    console.log(`🚀 Kozo server listening on http://localhost:${finalPort}`);

    // Run onStart lifecycle hook
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }
  }

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
  async listenSsr(port: number, ssrConfig: SsrConfig): Promise<{ server: Server; port: number }> {
    const manager = this.shutdownManager;

    // Store original fetch to avoid creating async wrapper per request
    const originalFetch = this.app.fetch as any;

    // Hot-swap fetch only when shutdown starts (not on every request)
    let shutdownStarted = false;
    manager.onShutdownStart(() => {
      shutdownStarted = true;
    });

    const shutdownFetch = (req: Request, ...args: any[]) => {
      // Fast path: normal operation (no async wrapper allocation)
      if (!shutdownStarted) {
        const untrack = manager.trackRequest();
        try {
          return originalFetch(req, ...args);
        } finally {
          untrack();
        }
      }

      // Slow path: shutdown mode - reject new requests
      if (manager.isShuttingDown()) {
        return new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Service Unavailable',
            status: 503,
            detail: 'Server is shutting down, please retry later',
          }),
          { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }

      // Still accepting in-flight requests during graceful shutdown
      const untrack = manager.trackRequest();
      try {
        return originalFetch(req, ...args);
      } finally {
        untrack();
      }
    };

    // Convert Hono fetch handler to Node.js request listener
    const { getRequestListener } = await import('@hono/node-server');
    const honoHandler = getRequestListener(shutdownFetch);

    const result = await createSsrServer(ssrConfig, honoHandler, port);
    manager.setServer(result.server);
    return result;
  }

  /**
   * Graceful shutdown — drains in-flight requests before closing.
   * Calls `onStop` lifecycle hook after draining and internal cleanup.
   * Use getShutdownManager().setDatabase(db, provider) to register DB cleanup.
   */
  async shutdown(options?: ShutdownOptions): Promise<void> {
    clearRateLimitStore();
    await this.shutdownManager.shutdown(options);
    // Run onStop lifecycle hook after draining all requests and internal cleanup
    if (this._onStop) {
      try {
        await this._onStop({ services: this.services });
      } catch (err) {
        console.error('[Kozo] onStop hook error:', err);
      }
    }
  }

  getShutdownManager(): ShutdownManager {
    return this.shutdownManager;
  }

  getApp(): Hono<KozoEnv> {
    return this.app;
  }

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
  middleware(pathOrHandler: string | MiddlewareHandler<KozoEnv>, handler?: MiddlewareHandler<KozoEnv>): this {
    if (typeof pathOrHandler === 'string') {
      this.app.use(pathOrHandler, handler!);
    } else {
      this.app.use(pathOrHandler);
    }
    return this;
  }

  /**
   * Returns all registered routes (file-system + manual) after {@link loadRoutes} completes.
   * Use this to inspect `meta.auth`, `meta.tags`, etc. at runtime.
   *
   * @example
   * await app.loadRoutes();
   * const publicRoutes = app.getRoutes().filter(r => r.meta?.auth === false);
   */
  getRoutes(): ReadonlyArray<{ method: HttpMethod; path: string; schema: RouteSchema; meta?: RouteMeta }> {
    return this.routes;
  }

  get fetch() {
    return this.app.fetch;
  }
}

export function createKozo<
  TServices extends Services = Services,
  TScoped extends Record<string, unknown> = Record<string, never>,
>(config?: KozoConfig<TServices, TScoped>): Kozo<TServices, TScoped> {
  return new Kozo<TServices, TScoped>(config);
}
