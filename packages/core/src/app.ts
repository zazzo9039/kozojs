// Use hono/quick for guaranteed RegExpRouter (fastest for benchmarks)
// SmartRouter sometimes falls back to TrieRouter on complex patterns
import { Hono } from 'hono/quick';
import type { MiddlewareHandler } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import type { KozoConfig, KozoEnv, Services, RouteSchema, KozoHandler, RouteMeta, HttpMethod, RouteDefinition } from './types.js';
import type { AnyScopeConfig } from './scoped-services.js';
import { generateTypedClient, type ClientGeneratorOptions, type RouteInfo } from './client-generator.js';
import { compileRouteHandler, compileUwsNativeHandler, SchemaCompiler, DEFAULT_MAX_BODY_BYTES } from './compiler.js';
import { clearRateLimitStore } from './middleware/rate-limit.js';
import { KozoError, internalErrorResponse, bodyTooLargeJson, notFoundResponse } from './errors.js';
import { ShutdownManager, type ShutdownOptions } from './shutdown.js';
import { scanRoutes, scanMiddleware, resolveRouteModule } from './router.js';
import { tryLoadUws, createUwsServer, makeUwsHonoBridge, middlewarePatternOverlaps, type UwsRouteEntry, type UwsCorsConfig } from './uws-transport.js';
import { guardToHonoMiddleware, compileGuards, wrapNativeWithGuards, type KozoGuard, type GuardEntry } from './guard.js';
import { createSsrServer, type SsrConfig } from './ssr.js';
import type { WebSocketHandler, WsRouteEntry } from './ws.js';
import { createOpenAPIGenerator, generateSwaggerHtml, type OpenAPISpec } from './openapi.js';

// Plugin Architecture
export interface Plugin {
  name: string;
  version?: string;
  install: (app: Kozo<Services>) => void | Promise<void>;
}

/** Options for {@link Kozo.mountDocs}. */
export interface MountDocsOptions {
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
  servers?: Array<{ url: string; description?: string }>;
  /**
   * Whether the docs routes are mounted at all.
   * Default: `process.env.NODE_ENV !== 'production'` — the spec is a complete
   * map of the API surface, so in production it stays off unless you opt in
   * explicitly (e.g. `enabled: env.ENABLE_DOCS`).
   */
  enabled?: boolean;
}

/**
 * Tag for a route path: first meaningful segment, skipping a leading `api`
 * prefix (`/api/billing/...` → `Billing`).
 */
function docsRouteTag(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const seg = (segments[0]?.toLowerCase() === 'api' ? segments[1] : segments[0]) ?? 'general';
  return seg.charAt(0).toUpperCase() + seg.slice(1);
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
  private _logger: boolean;
  private _onError?: KozoConfig['onError'];
  private _onNotFound?: KozoConfig['onNotFound'];
  private _allowUnenforcedResponse: boolean;
  /** Async plugin installs queued by use() — flushed before the server binds. */
  private _pendingPluginInstalls: Promise<void>[] = [];

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
    this._logger = config.logger !== false;
    this._onError = config.onError;
    this._onNotFound = config.onNotFound;
    this._allowUnenforcedResponse = config.dangerouslyAllowUnenforcedResponse === true;
    if (config.scopedServices) {
      this._scope = {
        base: this.services,
        factory: config.scopedServices as AnyScopeConfig['factory'],
        onEnd: config.onRequestEnd as AnyScopeConfig['onEnd'],
      };
    }

    // Global Error Handler (RFC 7807 Problem Details)
    this.app.onError((err, c) => {
      const hook = this._onError;
      if (hook) {
        try {
          const custom = hook(err as Error, c);
          if (custom instanceof Response) return custom;
          if (custom != null && typeof (custom as Promise<Response>).then === 'function') {
            return custom as Promise<Response>;
          }
        } catch (hookErr) {
          console.error('[Kozo] onError hook failed:', hookErr);
        }
      }

      // 1. Known Kozo errors (NotFoundError, ForbiddenError, etc.)
      if (err instanceof KozoError) {
        return err.toResponse(c.req.path);
      }

      // 2. Unknown errors (bugs in user code)
      console.error('[Kozo] Unhandled error:', err);
      return internalErrorResponse(err as Error, c.req.path);
    });

    this.app.notFound((c) => {
      const hook = this._onNotFound;
      if (hook) {
        try {
          const custom = hook(c);
          if (custom instanceof Response) return custom;
          if (custom != null && typeof (custom as Promise<Response>).then === 'function') {
            return custom as Promise<Response>;
          }
        } catch (hookErr) {
          console.error('[Kozo] onNotFound hook failed:', hookErr);
        }
      }
      return notFoundResponse(c.req.path);
    });
  }

  // Plugin system
  use(plugin: Plugin): this {
    try {
      const result = plugin.install(this as unknown as Kozo<Services>);
      if (result != null && typeof (result as Promise<void>).then === 'function') {
        this._pendingPluginInstalls.push(result as Promise<void>);
      }
    } catch (err) {
      console.error(`[Kozo] Plugin "${plugin.name}" install failed:`, err);
      throw err;
    }
    return this;
  }

  /** Await all async plugin installs registered via use(). Called before bind. */
  private async flushPluginInstalls(): Promise<void> {
    if (this._pendingPluginInstalls.length === 0) return;
    const pending = this._pendingPluginInstalls;
    this._pendingPluginInstalls = [];
    await Promise.all(pending);
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
      this._middlewarePatterns.push(mw.pathPrefix);
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
        const compiledSchema = SchemaCompiler.compile(schema, {
          route: `${method.toUpperCase()} ${path}`,
          dangerouslyAllowUnenforcedResponse: this._allowUnenforcedResponse,
        });
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
        this._onError,
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

    // 1. Compile schemas (Zod validators + fast-json-stringify response serializer)
    const compiled = SchemaCompiler.compile(normalizedSchema, {
      route: `${method.toUpperCase()} ${path}`,
      dangerouslyAllowUnenforcedResponse: this._allowUnenforcedResponse,
    });

    // 2. Generate the optimized Hono handler
    const optimizedHandler = compileRouteHandler(
      handler,
      normalizedSchema,
      this.services,
      compiled,
      this._scope,
      this._onError,
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
    await this.flushPluginInstalls();

    const opts = typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions ?? {});
    const port = opts.port ?? 3000;

    const uwsBindings = await tryLoadUws();
    if (!uwsBindings) {
      throw new Error(
        '[Kozo] uWebSockets.js is required but not installed.\n' +
        'It is published on GitHub, not npm — install it with:\n' +
        '  pnpm add uNetworking/uWebSockets.js#v20.66.0',
      );
    }

    const manager = this.shutdownManager;

    // Lazy-compile uWS handlers only when nativeListen is actually called.
    // Routes covered by a middleware pattern are bridged through the Hono
    // fetch pipeline (identical semantics to listen(): auth, rate limits,
    // CORS, … all run); uncovered routes keep the zero-shim native path.
    // Guards (app.guard) run natively on uncovered routes — no bridge needed.
    const patterns = this._middlewarePatterns;
    const honoFetch = this.app.fetch;
    let bridgedCount = 0;
    let guardedCount = 0;
    const uwsRoutes: UwsRouteEntry[] = this._deferredUws.map(r => {
      if (patterns.some(p => middlewarePatternOverlaps(p, r.path))) {
        // Bridged: guards run via their Hono twin inside the fetch pipeline.
        bridgedCount++;
        return {
          method: r.method,
          path: r.path,
          paramNames: r.paramNames,
          handler: makeUwsHonoBridge(r.method, honoFetch),
        };
      }
      const native = compileUwsNativeHandler(r.handler, r.schema, this.services, r.compiled, this._scope, this._maxBodyBytes, r.method);
      const guards = this._guards.filter(g => middlewarePatternOverlaps(g.pattern, r.path));
      if (guards.length === 0) {
        return { method: r.method, path: r.path, paramNames: r.paramNames, handler: native };
      }
      guardedCount++;
      return {
        method: r.method,
        path: r.path,
        paramNames: r.paramNames,
        handler: wrapNativeWithGuards(compileGuards(guards), native, r.method),
      };
    });
    if (this._logger && (bridgedCount > 0 || guardedCount > 0)) {
      const parts: string[] = [];
      if (guardedCount > 0) parts.push(`${guardedCount} native+guards`);
      if (bridgedCount > 0) parts.push(`${bridgedCount} Hono-bridged (app.middleware / _middleware.ts)`);
      console.log(`[Kozo] routes: ${parts.join(', ')}, ${uwsRoutes.length - bridgedCount - guardedCount} pure native of ${uwsRoutes.length}`);
    }

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
      maxBodyBytes: this._maxBodyBytes,
    });

    manager.setServer(result.server as unknown as Server);
    if (this._logger) {
      if (this._wsRoutes.length > 0) {
        console.log(`🚀 uWebSockets.js transport active (HTTP + ${this._wsRoutes.length} WebSocket route${this._wsRoutes.length > 1 ? 's' : ''})`);
      } else {
        console.log('🚀 uWebSockets.js transport active (C++ HTTP parser + native radix router)');
      }
    }

    // Run onStart lifecycle hook
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }

    return result as { port: number; server: Server };
  }

  async listen(port?: number): Promise<{ port: number; server: Server }> {
    await this.flushPluginInstalls();

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

    let resolveListening!: (p: number) => void;
    const listening = new Promise<number>((r) => { resolveListening = r; });

    const server = serve({
      fetch: (req: Request, ...args: any[]) => {
        // Reject oversized request bodies before they are read
        const contentLength = req.headers.get('content-length');
        if (contentLength !== null && Number(contentLength) > this._maxBodyBytes) {
          return new Response(bodyTooLargeJson(this._maxBodyBytes), {
            status: 413,
            headers: { 'Content-Type': 'application/problem+json' },
          });
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
    }, (info) => resolveListening(info.port)) as unknown as Server;

    manager.setServer(server);

    // Await the listening callback so we can report the actual bound port
    // (important when finalPort is 0 → OS-assigned ephemeral port).
    const boundPort = await listening;
    if (this._logger) {
      console.log(`🚀 Kozo server listening on http://localhost:${boundPort}`);
    }

    // Run onStart lifecycle hook
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }
    return { port: boundPort, server };
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
    await this.flushPluginInstalls();

    const manager = this.shutdownManager;

    // Store original fetch to avoid creating async wrapper per request
    const originalFetch = this.app.fetch as any;

    // Hot-swap fetch only when shutdown starts (not on every request)
    let shutdownStarted = false;
    manager.onShutdownStart(() => {
      shutdownStarted = true;
    });

    const shutdownFetch = (req: Request, ...args: any[]) => {
      const contentLength = req.headers.get('content-length');
      if (contentLength !== null && Number(contentLength) > this._maxBodyBytes) {
        return new Response(bodyTooLargeJson(this._maxBodyBytes), {
          status: 413,
          headers: { 'Content-Type': 'application/problem+json' },
        });
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

    const result = await createSsrServer({ logger: this._logger, ...ssrConfig }, honoHandler, port);
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
  private _middlewarePatterns: string[] = [];

  middleware(handler: MiddlewareHandler<KozoEnv>): this;
  middleware(path: string, handler: MiddlewareHandler<KozoEnv>): this;
  middleware(pathOrHandler: string | MiddlewareHandler<KozoEnv>, handler?: MiddlewareHandler<KozoEnv>): this {
    if (typeof pathOrHandler === 'string') {
      this.app.use(pathOrHandler, handler!);
      this._middlewarePatterns.push(pathOrHandler);
    } else {
      this.app.use(pathOrHandler);
      this._middlewarePatterns.push('*');
    }
    return this;
  }

  /**
   * Guards registered via {@link guard}. Unlike `_middlewarePatterns`, these
   * do NOT force routes through the Hono bridge under `nativeListen()` —
   * they are compiled directly into the uWS fast path.
   */
  private _guards: GuardEntry[] = [];

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
  guard(pattern: string, guard: KozoGuard): this {
    this._guards.push({ pattern, guard });
    // Hono twin: identical semantics under listen() and on bridged routes.
    this.app.use(pattern, guardToHonoMiddleware(guard));
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
  mountDocs(options: MountDocsOptions = {}): this {
    const enabled = options.enabled ?? process.env.NODE_ENV !== 'production';
    if (!enabled) return this;

    const uiPath = options.path ?? '/docs';
    const specPath = `${uiPath}.json`;
    const info = {
      title: options.title ?? 'API',
      version: options.version ?? '0.0.0',
      description: options.description,
    };

    let cachedSpec: OpenAPISpec | null = null;
    const buildSpec = (): OpenAPISpec => {
      if (cachedSpec) return cachedSpec;
      const apiRoutes = this.getRoutes().filter(
        (r) => r.path !== uiPath && r.path !== specPath,
      );
      const seen = new Set<string>();
      const tags = apiRoutes
        .map((r) => r.meta?.tags?.[0] ?? docsRouteTag(r.path))
        .filter((name) => !seen.has(name) && seen.add(name))
        .map((name) => ({ name, description: `${name} endpoints` }));
      const definitions: RouteDefinition[] = apiRoutes.map((r) => ({
        path: r.path,
        method: r.method,
        filePath: r.path,
        module: {
          default: () => undefined,
          schema: r.schema,
          meta: { ...r.meta, tags: r.meta?.tags ?? [docsRouteTag(r.path)] },
        },
      }));
      cachedSpec = createOpenAPIGenerator({ info, servers: options.servers, tags }).generate(definitions);
      return cachedSpec;
    };

    this.get(uiPath, {}, (ctx) => ctx.html(generateSwaggerHtml(specPath, info.title)), {
      auth: false,
      summary: 'API documentation (Swagger UI)',
    });
    this.get(specPath, {}, (ctx) => ctx.json(buildSpec() as any), {
      auth: false,
      summary: 'OpenAPI 3.1 specification',
    });
    return this;
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
