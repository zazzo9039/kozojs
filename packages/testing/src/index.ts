import { createKozo } from '@kozojs/core';
import type {
  AnyContractRoute,
  ContractRoute,
  InferInput,
  InferSchema,
  Kozo,
  KozoConfig,
  SchemaType,
  Services,
} from '@kozojs/core';

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

export interface TestTransport {
  send(request: Request): Promise<Response>;
}

export interface TestClient<TServices extends Services = Services> {
  /** The underlying Kozo app instance */
  app: Kozo<TServices, any, any>;
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

type PathPrimitive = string | number | boolean;

type TrimLeadingSlash<TPath extends string> =
  TPath extends `/${infer TRest}` ? TrimLeadingSlash<TRest> : TPath;

type TrimTrailingSlash<TPath extends string> =
  TPath extends `${infer TRest}/` ? TrimTrailingSlash<TRest> : TPath;

type SplitPath<TPath extends string> =
  TrimTrailingSlash<TrimLeadingSlash<TPath>> extends infer TTrimmed extends string
    ? TTrimmed extends '' ? [] : TTrimmed extends `${infer THead}/${infer TTail}`
      ? [THead, ...SplitPath<TTail>]
      : [TTrimmed]
    : never;

type StripOptionalParam<TName extends string> =
  TName extends `${infer TBase}?` ? TBase : TName;

type PathParamNames<TPath extends string> =
  SplitPath<TPath>[number] extends infer TSegment
    ? TSegment extends `:${infer TName}` ? StripOptionalParam<TName>
      : TSegment extends '*' ? 'wildcard'
        : never
    : never;

type NormalizeDelimited<TSegment extends string> =
  TSegment extends `${infer THead}-${infer TTail}`
    ? `${NormalizeDelimited<THead>}${Capitalize<NormalizeDelimited<TTail>>}`
    : TSegment extends `${infer THead}_${infer TTail}`
      ? `${NormalizeDelimited<THead>}${Capitalize<NormalizeDelimited<TTail>>}`
      : TSegment extends `${infer THead}.${infer TTail}`
        ? `${NormalizeDelimited<THead>}${Capitalize<NormalizeDelimited<TTail>>}`
        : TSegment;

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

type SafeSegment<TSegment extends string> =
  NormalizeDelimited<TSegment> extends infer TNormalized extends string
    ? TNormalized extends `${Digit}${string}` ? `route${Capitalize<TNormalized>}`
      : TNormalized extends '' ? 'index'
        : TNormalized
    : never;

type TreeSegment<TSegment extends string> =
  TSegment extends `:${infer TName}`
    ? `$${SafeSegment<StripOptionalParam<TName>>}`
    : TSegment extends '*' ? '$wildcard'
      : SafeSegment<TSegment>;

type FieldSchema<TSchema, TKey extends PropertyKey> =
  TKey extends keyof TSchema ? TSchema[TKey] : never;

type HasSchemaField<TSchema, TKey extends PropertyKey> =
  [FieldSchema<TSchema, TKey>] extends [never] ? false
    : FieldSchema<TSchema, TKey> extends SchemaType ? true
      : false;

type InputFor<TSchema, TKey extends PropertyKey> =
  FieldSchema<TSchema, TKey> extends SchemaType
    ? InferInput<FieldSchema<TSchema, TKey>>
    : never;

type ParamsPart<TPath extends string, TSchema> =
  [PathParamNames<TPath>] extends [never]
    ? HasSchemaField<TSchema, 'params'> extends true
      ? { params: InputFor<TSchema, 'params'> }
      : {}
    : {
      params: HasSchemaField<TSchema, 'params'> extends true
        ? InputFor<TSchema, 'params'> & Record<PathParamNames<TPath>, PathPrimitive>
        : Record<PathParamNames<TPath>, PathPrimitive>;
    };

type OptionalObjectPart<TKey extends string, TValue> =
  undefined extends TValue ? { [TProperty in TKey]?: TValue }
    : {} extends TValue ? { [TProperty in TKey]?: TValue }
      : { [TProperty in TKey]: TValue };

type QueryPart<TSchema> =
  HasSchemaField<TSchema, 'query'> extends true
    ? OptionalObjectPart<'query', InputFor<TSchema, 'query'>>
    : {};

type HeadersPart<TSchema> =
  HasSchemaField<TSchema, 'headers'> extends true
    ? OptionalObjectPart<'headers', InputFor<TSchema, 'headers'>>
    : {};

type BodyPart<TSchema> =
  HasSchemaField<TSchema, 'body'> extends true
    ? undefined extends InputFor<TSchema, 'body'>
      ? { body?: InputFor<TSchema, 'body'> }
      : { body: InputFor<TSchema, 'body'> }
    : {};

type RequestFor<TPath extends string, TSchema> =
  ParamsPart<TPath, TSchema>
  & QueryPart<TSchema>
  & HeadersPart<TSchema>
  & BodyPart<TSchema>;

type RequiredKeys<TValue> = {
  [TKey in keyof TValue]-?: {} extends Pick<TValue, TKey> ? never : TKey;
}[keyof TValue];

type SuccessFor<TStatus extends number> =
  number extends TStatus ? boolean
    : `${TStatus}` extends `2${string}` ? true
      : false;

export interface ContractTestResponse<
  TBody = unknown,
  TStatus extends number = number,
> {
  status: TStatus;
  headers: Headers;
  body: string;
  ok: SuccessFor<TStatus>;
  json(): TBody;
}

type NumericStatus<TKey> =
  TKey extends number ? TKey
    : TKey extends `${infer TStatus extends number}` ? TStatus
      : never;

type ResponseMapUnion<TResponses extends Record<PropertyKey, unknown>> = {
  [TStatus in keyof TResponses]:
    TResponses[TStatus] extends SchemaType
      ? ContractTestResponse<
        InferSchema<TResponses[TStatus]>,
        NumericStatus<TStatus>
      >
      : never;
}[keyof TResponses];

type ResponseFor<TSchema> =
  [FieldSchema<TSchema, 'response'>] extends [never]
    ? ContractTestResponse<unknown>
    : FieldSchema<TSchema, 'response'> extends infer TResponse
    ? TResponse extends SchemaType
      ? ContractTestResponse<InferSchema<TResponse>>
      : TResponse extends Record<number, SchemaType>
        ? ResponseMapUnion<TResponse>
        : ContractTestResponse<unknown>
      : ContractTestResponse<unknown>;

type OperationFor<TPath extends string, TSchema> =
  RequestFor<TPath, TSchema> extends infer TRequest extends object
    ? keyof TRequest extends never
      ? () => Promise<ResponseFor<TSchema>>
      : RequiredKeys<TRequest> extends never
        ? (request?: TRequest) => Promise<ResponseFor<TSchema>>
        : (request: TRequest) => Promise<ResponseFor<TSchema>>
    : never;

type RouteTree<
  TSegments extends readonly string[],
  TMethod extends string,
  TOperation,
> = TSegments extends readonly [
  infer THead extends string,
  ...infer TTail extends string[],
]
  ? { [TKey in TreeSegment<THead>]: RouteTree<TTail, TMethod, TOperation> }
  : { [TKey in TMethod]: TOperation };

type TreeForRoute<TRoute> =
  TRoute extends ContractRoute<
    infer TMethod,
    infer TPath,
    infer TSchema
  >
    ? RouteTree<SplitPath<TPath>, TMethod, OperationFor<TPath, TSchema>>
    : never;

type UnionToIntersection<TUnion> =
  (TUnion extends unknown ? (value: TUnion) => void : never) extends
    (value: infer TIntersection) => void
    ? TIntersection
    : never;

export type ContractTestClient<
  TRoutes extends AnyContractRoute,
> = [TRoutes] extends [never]
  ? Record<never, never>
  : UnionToIntersection<TreeForRoute<TRoutes>>;

export type ContractRoutesOf<TApp> =
  TApp extends Kozo<any, any, infer TRoutes> ? TRoutes : never;

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

async function readTestResponse(res: Response): Promise<TestResponse> {
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

async function doInject(
  transport: TestTransport,
  options: InjectOptions,
): Promise<TestResponse> {
  return readTestResponse(await transport.send(buildRequest(options)));
}

function normalizeTreeSegment(segment: string): string {
  if (segment === '*') return '$wildcard';

  const dynamic = segment.startsWith(':');
  const source = dynamic ? segment.slice(1).replace(/\?$/, '') : segment;
  if (!/^[A-Za-z0-9._-]+$/.test(source)) {
    throw new Error(
      `[Kozo] Cannot create contract client: route segment "${segment}" ` +
      'contains unsupported characters.',
    );
  }

  const parts = source.split(/[._-]+/).filter(Boolean);
  let normalized = parts
    .map((part, index) => index === 0
      ? part
      : part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  if (!normalized) normalized = 'index';
  if (/^\d/.test(normalized)) {
    normalized = `route${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }
  return dynamic ? `$${normalized}` : normalized;
}

function materializePath(
  routePath: string,
  params: Record<string, unknown> | undefined,
): string {
  const segments = routePath.split('/').filter(Boolean);
  const materialized: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith(':')) {
      const optional = segment.endsWith('?');
      const name = segment.slice(1, optional ? -1 : undefined);
      const value = params?.[name];
      if (value == null) {
        if (optional) continue;
        throw new TypeError(
          `[Kozo] Missing path parameter "${name}" for route ${routePath}.`,
        );
      }
      materialized.push(encodeURIComponent(String(value)));
      continue;
    }

    if (segment === '*') {
      const value = params?.wildcard;
      if (value == null) {
        throw new TypeError(
          `[Kozo] Missing path parameter "wildcard" for route ${routePath}.`,
        );
      }
      materialized.push(
        ...String(value).split('/').map(part => encodeURIComponent(part)),
      );
      continue;
    }

    materialized.push(segment);
  }

  return materialized.length > 0 ? `/${materialized.join('/')}` : '/';
}

function stringHeaders(value: unknown): Record<string, string> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue == null) continue;
    headers[key] = Array.isArray(headerValue)
      ? headerValue.map(String).join(', ')
      : String(headerValue);
  }
  return headers;
}

function createRouteOperation(
  transport: TestTransport,
  method: string,
  routePath: string,
): (input?: Record<string, unknown>) => Promise<TestResponse> {
  return async (input = {}) => {
    const params = input.params && typeof input.params === 'object'
      ? input.params as Record<string, unknown>
      : undefined;
    const query = input.query && typeof input.query === 'object'
      ? input.query as Record<string, TestQueryValue>
      : undefined;

    return doInject(transport, {
      method: method.toUpperCase(),
      url: materializePath(routePath, params),
      query,
      headers: stringHeaders(input.headers),
      body: input.body,
    });
  };
}

function createRouteTree(
  app: Kozo<any, any, any>,
  transport: TestTransport,
  reservedRootKeys: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  const root: Record<string, unknown> = Object.create(null);
  const segmentSources = new WeakMap<object, Map<string, string>>();

  for (const route of app.getRoutes()) {
    const pathSegments = route.path.split('/').filter(Boolean);
    let node = root;

    for (let index = 0; index < pathSegments.length; index++) {
      const source = pathSegments[index]!;
      const key = normalizeTreeSegment(source);
      if (index === 0 && reservedRootKeys.has(key)) {
        throw new Error(
          `[Kozo] Cannot create contract client: route ${route.method.toUpperCase()} ` +
          `${route.path} conflicts with reserved root member "${key}".`,
        );
      }

      let sources = segmentSources.get(node);
      if (!sources) {
        sources = new Map();
        segmentSources.set(node, sources);
      }
      const previousSource = sources.get(key);
      if (previousSource !== undefined && previousSource !== source) {
        throw new Error(
          `[Kozo] Cannot create contract client: route segments ` +
          `"${previousSource}" and "${source}" both normalize to "${key}".`,
        );
      }
      sources.set(key, source);

      const child = node[key];
      if (typeof child === 'function') {
        throw new Error(
          `[Kozo] Cannot create contract client: path segment "${source}" ` +
          `conflicts with an HTTP method at ${route.path}.`,
        );
      }
      if (child === undefined) {
        node[key] = Object.create(null) as Record<string, unknown>;
      }
      node = node[key] as Record<string, unknown>;
    }

    const method = route.method.toLowerCase();
    if (node[method] !== undefined) {
      throw new Error(
        `[Kozo] Cannot create contract client: duplicate operation ` +
        `${route.method.toUpperCase()} ${route.path}.`,
      );
    }
    node[method] = createRouteOperation(transport, route.method, route.path);
  }

  return root;
}

export function createFetchTestTransport(
  app: Kozo<any, any, any>,
): TestTransport {
  const fetchFn = app.fetch.bind(app);
  return {
    async send(request) {
      return Promise.resolve(fetchFn(request));
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
export function createTestClient<
  TServices extends Services = Services,
  TScoped extends Record<string, unknown> = Record<string, never>,
  TRoutes extends AnyContractRoute = never,
>(
  app: Kozo<TServices, TScoped, TRoutes>,
): TestClient<TServices> {
  const transport = createFetchTestTransport(app);

  return {
    app,
    inject: (opts) => doInject(transport, opts),
    get: (url, opts = {}) => doInject(transport, { ...opts, method: 'GET', url }),
    post: (url, body?, opts = {}) => doInject(transport, { ...opts, method: 'POST', url, body }),
    put: (url, body?, opts = {}) => doInject(transport, { ...opts, method: 'PUT', url, body }),
    patch: (url, body?, opts = {}) => doInject(transport, { ...opts, method: 'PATCH', url, body }),
    delete: (url, opts = {}) => doInject(transport, { ...opts, method: 'DELETE', url }),
  };
}

/**
 * Create a route-tree client whose inputs and JSON responses are derived from
 * the static contract carried by the app.
 */
export function createContractTestClient<
  TServices extends Services,
  TScoped extends Record<string, unknown>,
  TRoutes extends AnyContractRoute,
>(
  app: Kozo<TServices, TScoped, TRoutes>,
): ContractTestClient<TRoutes> {
  return createRouteTree(
    app,
    createFetchTestTransport(app),
  ) as ContractTestClient<TRoutes>;
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

export interface NativeTestTransport extends TestTransport {
  port: number;
  close(): Promise<void>;
}

export type NativeContractTestClient<
  TRoutes extends AnyContractRoute,
> = ContractTestClient<TRoutes> & {
  readonly port: number;
  close(): Promise<void>;
};

/**
 * Start the native server and expose it through the same Request/Response
 * transport interface used by in-process contract tests.
 */
export async function createNativeTestTransport(
  app: Kozo<any, any, any>,
): Promise<NativeTestTransport> {
  const { port, server } = await app.nativeListen({ port: 0 });
  const base = `http://127.0.0.1:${port}`;
  let closed = false;

  return {
    port,
    async close() {
      if (closed) return;
      closed = true;
      server.close();
    },
    async send(request) {
      const url = new URL(request.url);
      const method = request.method;
      const canHaveBody = method !== 'GET' && method !== 'HEAD';
      const bytes = canHaveBody ? await request.arrayBuffer() : undefined;
      const body = bytes && bytes.byteLength > 0 ? bytes : undefined;
      return fetch(base + url.pathname + url.search, {
        method,
        headers: request.headers,
        body,
      });
    },
  };
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
export async function createNativeTestClient<
  TServices extends Services = Services,
  TScoped extends Record<string, unknown> = Record<string, never>,
  TRoutes extends AnyContractRoute = never,
>(
  app: Kozo<TServices, TScoped, TRoutes>,
): Promise<NativeTestClient<TServices>> {
  const transport = await createNativeTestTransport(app);
  return {
    app,
    port: transport.port,
    close: () => transport.close(),
    inject: (opts) => doInject(transport, opts),
    get: (url, opts = {}) => doInject(transport, { ...opts, method: 'GET', url }),
    post: (url, body?, opts = {}) => doInject(transport, { ...opts, method: 'POST', url, body }),
    put: (url, body?, opts = {}) => doInject(transport, { ...opts, method: 'PUT', url, body }),
    patch: (url, body?, opts = {}) => doInject(transport, { ...opts, method: 'PATCH', url, body }),
    delete: (url, opts = {}) => doInject(transport, { ...opts, method: 'DELETE', url }),
  };
}

/**
 * Create the route-tree client against a real `nativeListen()` server.
 */
export async function createNativeContractTestClient<
  TServices extends Services,
  TScoped extends Record<string, unknown>,
  TRoutes extends AnyContractRoute,
>(
  app: Kozo<TServices, TScoped, TRoutes>,
): Promise<NativeContractTestClient<TRoutes>> {
  const transport = await createNativeTestTransport(app);
  const client = createRouteTree(
    app,
    transport,
    new Set(['close', 'port']),
  );
  Object.defineProperties(client, {
    port: { value: transport.port, enumerable: false },
    close: { value: () => transport.close(), enumerable: false },
  });
  return client as NativeContractTestClient<TRoutes>;
}
