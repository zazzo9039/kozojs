import { Services, Kozo, KozoConfig } from '@kozojs/core';

interface InjectOptions {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    /** Shorthand: appended as query string to the URL */
    query?: Record<string, string>;
}
interface TestResponse {
    status: number;
    headers: Headers;
    body: string;
    ok: boolean;
    /** Parse the response body as JSON */
    json<T = unknown>(): T;
}
interface TestClient<TServices extends Services = Services> {
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
declare function createTestClient<TServices extends Services = Services>(app: Kozo<TServices>): TestClient<TServices>;
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
declare function createTestApp<TServices extends Services = Services>(config?: KozoConfig<TServices>): TestClient<TServices>;

export { type InjectOptions, type TestClient, type TestResponse, createTestApp, createTestClient };
