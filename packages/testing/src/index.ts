import { createKozo } from '@kozojs/core';
import type { Kozo, KozoConfig, Services } from '@kozojs/core';

// ============================================================================
// Types
// ============================================================================

export interface InjectOptions {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Shorthand: appended as query string to the URL */
  query?: Record<string, TestQueryValue>;
}

export type TestQueryPrimitive = string | number | boolean;

export type TestQueryValue =
  | TestQueryPrimitive
  | readonly TestQueryPrimitive[]
  | null
  | undefined;

export interface TestResponse {
  status: number;
  headers: Headers;
  body: string;
  ok: boolean;
  /** Parse the response body as JSON */
  json<T = unknown>(): T;
}

export interface TestClient<TServices extends Services = Services> {
  /** The underlying Kozo app instance */
  app: Kozo<TServices>;
  /** Make an arbitrary in-process HTTP request */
  inject(options: InjectOptions): Promise<TestResponse>;
  /** GET shorthand */
  get(url: string, opts?: Omit<InjectOptions, 'method' | 'url'>): Promise<TestResponse>;
  /** POST shorthand — body is JSON-serialized automatically */
  post(url: string, body?: unknown, opts?: Omit<InjectOptions, 'method' | 'url' | 'body'>): Promise<TestResponse>;
  /** PUT shorthand */
  put(url: string, body?: unknown, opts?: Omit<InjectOptions, 'method' | 'url' | 'body'>): Promise<TestResponse>;
  /** PATCH shorthand */
  patch(url: string, body?: unknown, opts?: Omit<InjectOptions, 'method' | 'url' | 'body'>): Promise<TestResponse>;
  /** DELETE shorthand */
  delete(url: string, opts?: Omit<InjectOptions, 'method' | 'url'>): Promise<TestResponse>;
}

// ============================================================================
// Internal helpers
// ============================================================================

function appendQuery(searchParams: URLSearchParams, query: Record<string, TestQueryValue>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) searchParams.append(key, String(item));
  }
}

function isPassThroughBody(body: unknown): body is BodyInit {
  return body instanceof URLSearchParams
    || body instanceof FormData
    || body instanceof Blob
    || body instanceof ArrayBuffer
    || ArrayBuffer.isView(body);
}

function buildRequest(options: InjectOptions): Request {
  const { method = 'GET', url, headers = {}, body, query } = options;

  const requestUrl = new URL(url, 'http://localhost');
  if (query && Object.keys(query).length > 0) {
    appendQuery(requestUrl.searchParams, query);
  }

  const finalHeaders = new Headers(headers);
  let finalBody: BodyInit | undefined;

  if (body !== undefined) {
    if (typeof body === 'string') {
      // Undici assigns text/plain;charset=UTF-8 to string BodyInit values.
      // Encoding the same bytes explicitly preserves a truly raw string body.
      finalBody = new TextEncoder().encode(body);
    } else if (isPassThroughBody(body)) {
      finalBody = body;
    } else {
      if (!finalHeaders.has('content-type')) {
        finalHeaders.set('content-type', 'application/json');
      }
      finalBody = JSON.stringify(body);
    }
  }

  return new Request(requestUrl, { method, headers: finalHeaders, body: finalBody });
}

async function doInject(
  fetchFn: (req: Request) => Response | Promise<Response>,
  options: InjectOptions,
): Promise<TestResponse> {
  const req = buildRequest(options);
  const res = await Promise.resolve(fetchFn(req));
  const bodyText = await res.text();

  return {
    status: res.status,
    headers: res.headers,
    body: bodyText,
    ok: res.ok,
    json<T = unknown>(): T {
      try {
        return JSON.parse(bodyText) as T;
      } catch {
        throw new Error('Failed to parse response body as JSON');
      }
    },
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Wrap an existing Kozo app with a test client.
 *
 * @example
 * ```ts
 * import { createKozo, z } from '@kozojs/core';
 * import { createTestClient } from '@kozojs/testing';
 *
 * const app = createKozo();
 * app.get('/ping', {}, () => ({ pong: true }));
 *
 * const client = createTestClient(app);
 * const res = await client.get('/ping');
 * expect(res.status).toBe(200);
 * expect(res.json()).toEqual({ pong: true });
 * ```
 */
export function createTestClient<TServices extends Services = Services>(
  app: Kozo<TServices>,
): TestClient<TServices> {
  const fetchFn = app.fetch.bind(app);

  return {
    app,
    inject: (opts) => doInject(fetchFn, opts),
    get: (url, opts = {}) => doInject(fetchFn, { ...opts, method: 'GET', url }),
    post: (url, body?, opts = {}) => doInject(fetchFn, { ...opts, method: 'POST', url, body }),
    put: (url, body?, opts = {}) => doInject(fetchFn, { ...opts, method: 'PUT', url, body }),
    patch: (url, body?, opts = {}) => doInject(fetchFn, { ...opts, method: 'PATCH', url, body }),
    delete: (url, opts = {}) => doInject(fetchFn, { ...opts, method: 'DELETE', url }),
  };
}

/**
 * Create a Kozo app + test client in one call.
 *
 * @example
 * ```ts
 * import { z } from '@kozojs/core';
 * import { createTestApp } from '@kozojs/testing';
 *
 * const { app, post } = createTestApp();
 *
 * app.post('/users', {
 *   body: z.object({ name: z.string(), email: z.string().email() }),
 * }, ({ body }) => ({ id: 1, ...body }));
 *
 * const res = await post('/users', { name: 'Alice', email: 'alice@example.com' });
 * expect(res.status).toBe(200);
 * expect(res.json()).toMatchObject({ name: 'Alice' });
 *
 * // Validation error
 * const bad = await post('/users', { name: 'Alice', email: 'not-an-email' });
 * expect(bad.status).toBe(400);
 * expect(bad.json().errors[0]).toMatchObject({ field: 'email', code: 'invalid_string' });
 * ```
 */
export function createTestApp<TServices extends Services = Services>(
  config?: KozoConfig<TServices>,
): TestClient<TServices> {
  return createTestClient(createKozo(config));
}

// ============================================================================
// Native (uWebSockets.js) transport test client
// ============================================================================

export interface NativeTestClient<TServices extends Services = Services>
  extends TestClient<TServices> {
  /** Port the native (uWebSockets.js) server is listening on. */
  port: number;
  /** Shut the native server down. Always call this (e.g. in afterEach/afterAll). */
  close(): Promise<void>;
}

/**
 * Boot the app on the native uWebSockets.js transport (`nativeListen`) and
 * return a client that makes REAL HTTP requests to it.
 *
 * `createTestClient` exercises only the Hono (`listen()`) pipeline via
 * `app.fetch`. Use this to test behavior that is specific to the native path —
 * guards, `ctx.header()`, optional params, CORS — the way it actually runs in
 * production under `nativeListen()`.
 *
 * Requires `uWebSockets.js` to be installed. Remember to call `close()`.
 *
 * @example
 * ```ts
 * const client = await createNativeTestClient(app);
 * try {
 *   const res = await client.get('/ping');
 *   expect(res.status).toBe(200);
 * } finally {
 *   await client.close();
 * }
 * ```
 */
export async function createNativeTestClient<TServices extends Services = Services>(
  app: Kozo<TServices>,
): Promise<NativeTestClient<TServices>> {
  const { port, server } = await app.nativeListen({ port: 0 });
  const base = `http://127.0.0.1:${port}`;

  // Rewrite the in-process Request onto the real server and use global fetch.
  const fetchFn = async (req: Request): Promise<Response> => {
    const u = new URL(req.url);
    const method = req.method;
    const body = method === 'GET' || method === 'HEAD' ? undefined : await req.text();
    return fetch(base + u.pathname + u.search, { method, headers: req.headers, body });
  };

  let closed = false;
  return {
    app,
    port,
    async close() {
      if (closed) return;
      closed = true;
      server.close();
    },
    inject: (opts) => doInject(fetchFn, opts),
    get: (url, opts = {}) => doInject(fetchFn, { ...opts, method: 'GET', url }),
    post: (url, body?, opts = {}) => doInject(fetchFn, { ...opts, method: 'POST', url, body }),
    put: (url, body?, opts = {}) => doInject(fetchFn, { ...opts, method: 'PUT', url, body }),
    patch: (url, body?, opts = {}) => doInject(fetchFn, { ...opts, method: 'PATCH', url, body }),
    delete: (url, opts = {}) => doInject(fetchFn, { ...opts, method: 'DELETE', url }),
  };
}
