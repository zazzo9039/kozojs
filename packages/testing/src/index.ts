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
  query?: Record<string, string>;
}

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

function buildRequest(options: InjectOptions): Request {
  const { method = 'GET', url, headers = {}, body, query } = options;

  let fullUrl = url.startsWith('http') ? url : `http://localhost${url}`;

  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams(query);
    fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs.toString();
  }

  const finalHeaders: Record<string, string> = { ...headers };
  let finalBody: BodyInit | undefined;

  if (body !== undefined) {
    if (!finalHeaders['content-type'] && !finalHeaders['Content-Type']) {
      finalHeaders['Content-Type'] = 'application/json';
    }
    finalBody = typeof body === 'string' ? body : JSON.stringify(body);
  }

  return new Request(fullUrl, { method, headers: finalHeaders, body: finalBody });
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
