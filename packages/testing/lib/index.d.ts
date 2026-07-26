import { Services, Kozo, AnyContractRoute, ContractRoute, SchemaType, InferInput, InferSchema, KozoConfig } from '@kozojs/core';

interface InjectOptions {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    /** Shorthand: appended as query string to the URL */
    query?: Record<string, TestQueryValue>;
}
type TestQueryPrimitive = string | number | boolean;
type TestQueryValue = TestQueryPrimitive | readonly TestQueryPrimitive[] | null | undefined;
interface TestResponse {
    status: number;
    headers: Headers;
    body: string;
    ok: boolean;
    /** Parse the response body as JSON */
    json<T = unknown>(): T;
}
interface TestTransport {
    send(request: Request): Promise<Response>;
}
interface TestClient<TServices extends Services = Services> {
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
type TrimLeadingSlash<TPath extends string> = TPath extends `/${infer TRest}` ? TrimLeadingSlash<TRest> : TPath;
type TrimTrailingSlash<TPath extends string> = TPath extends `${infer TRest}/` ? TrimTrailingSlash<TRest> : TPath;
type SplitPath<TPath extends string> = TrimTrailingSlash<TrimLeadingSlash<TPath>> extends infer TTrimmed extends string ? TTrimmed extends '' ? [] : TTrimmed extends `${infer THead}/${infer TTail}` ? [THead, ...SplitPath<TTail>] : [TTrimmed] : never;
type StripOptionalParam<TName extends string> = TName extends `${infer TBase}?` ? TBase : TName;
type PathParamNames<TPath extends string> = SplitPath<TPath>[number] extends infer TSegment ? TSegment extends `:${infer TName}` ? StripOptionalParam<TName> : TSegment extends '*' ? 'wildcard' : never : never;
type NormalizeDelimited<TSegment extends string> = TSegment extends `${infer THead}-${infer TTail}` ? `${NormalizeDelimited<THead>}${Capitalize<NormalizeDelimited<TTail>>}` : TSegment extends `${infer THead}_${infer TTail}` ? `${NormalizeDelimited<THead>}${Capitalize<NormalizeDelimited<TTail>>}` : TSegment extends `${infer THead}.${infer TTail}` ? `${NormalizeDelimited<THead>}${Capitalize<NormalizeDelimited<TTail>>}` : TSegment;
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type SafeSegment<TSegment extends string> = NormalizeDelimited<TSegment> extends infer TNormalized extends string ? TNormalized extends `${Digit}${string}` ? `route${Capitalize<TNormalized>}` : TNormalized extends '' ? 'index' : TNormalized : never;
type TreeSegment<TSegment extends string> = TSegment extends `:${infer TName}` ? `$${SafeSegment<StripOptionalParam<TName>>}` : TSegment extends '*' ? '$wildcard' : SafeSegment<TSegment>;
type FieldSchema<TSchema, TKey extends PropertyKey> = TKey extends keyof TSchema ? TSchema[TKey] : never;
type HasSchemaField<TSchema, TKey extends PropertyKey> = [
    FieldSchema<TSchema, TKey>
] extends [never] ? false : FieldSchema<TSchema, TKey> extends SchemaType ? true : false;
type InputFor<TSchema, TKey extends PropertyKey> = FieldSchema<TSchema, TKey> extends SchemaType ? InferInput<FieldSchema<TSchema, TKey>> : never;
type ParamsPart<TPath extends string, TSchema> = [
    PathParamNames<TPath>
] extends [never] ? HasSchemaField<TSchema, 'params'> extends true ? {
    params: InputFor<TSchema, 'params'>;
} : {} : {
    params: HasSchemaField<TSchema, 'params'> extends true ? InputFor<TSchema, 'params'> & Record<PathParamNames<TPath>, PathPrimitive> : Record<PathParamNames<TPath>, PathPrimitive>;
};
type OptionalObjectPart<TKey extends string, TValue> = undefined extends TValue ? {
    [TProperty in TKey]?: TValue;
} : {} extends TValue ? {
    [TProperty in TKey]?: TValue;
} : {
    [TProperty in TKey]: TValue;
};
type QueryPart<TSchema> = HasSchemaField<TSchema, 'query'> extends true ? OptionalObjectPart<'query', InputFor<TSchema, 'query'>> : {};
type HeadersPart<TSchema> = HasSchemaField<TSchema, 'headers'> extends true ? OptionalObjectPart<'headers', InputFor<TSchema, 'headers'>> : {};
type BodyPart<TSchema> = HasSchemaField<TSchema, 'body'> extends true ? undefined extends InputFor<TSchema, 'body'> ? {
    body?: InputFor<TSchema, 'body'>;
} : {
    body: InputFor<TSchema, 'body'>;
} : {};
type RequestFor<TPath extends string, TSchema> = ParamsPart<TPath, TSchema> & QueryPart<TSchema> & HeadersPart<TSchema> & BodyPart<TSchema>;
type RequiredKeys<TValue> = {
    [TKey in keyof TValue]-?: {} extends Pick<TValue, TKey> ? never : TKey;
}[keyof TValue];
type SuccessFor<TStatus extends number> = number extends TStatus ? boolean : `${TStatus}` extends `2${string}` ? true : false;
interface ContractTestResponse<TBody = unknown, TStatus extends number = number> {
    status: TStatus;
    headers: Headers;
    body: string;
    ok: SuccessFor<TStatus>;
    json(): TBody;
}
type NumericStatus<TKey> = TKey extends number ? TKey : TKey extends `${infer TStatus extends number}` ? TStatus : never;
type ResponseMapUnion<TResponses extends Record<PropertyKey, unknown>> = {
    [TStatus in keyof TResponses]: TResponses[TStatus] extends SchemaType ? ContractTestResponse<InferSchema<TResponses[TStatus]>, NumericStatus<TStatus>> : never;
}[keyof TResponses];
type ResponseFor<TSchema> = [
    FieldSchema<TSchema, 'response'>
] extends [never] ? ContractTestResponse<unknown> : FieldSchema<TSchema, 'response'> extends infer TResponse ? TResponse extends SchemaType ? ContractTestResponse<InferSchema<TResponse>> : TResponse extends Record<number, SchemaType> ? ResponseMapUnion<TResponse> : ContractTestResponse<unknown> : ContractTestResponse<unknown>;
type OperationFor<TPath extends string, TSchema> = RequestFor<TPath, TSchema> extends infer TRequest extends object ? keyof TRequest extends never ? () => Promise<ResponseFor<TSchema>> : RequiredKeys<TRequest> extends never ? (request?: TRequest) => Promise<ResponseFor<TSchema>> : (request: TRequest) => Promise<ResponseFor<TSchema>> : never;
type RouteTree<TSegments extends readonly string[], TMethod extends string, TOperation> = TSegments extends readonly [
    infer THead extends string,
    ...infer TTail extends string[]
] ? {
    [TKey in TreeSegment<THead>]: RouteTree<TTail, TMethod, TOperation>;
} : {
    [TKey in TMethod]: TOperation;
};
type TreeForRoute<TRoute> = TRoute extends ContractRoute<infer TMethod, infer TPath, infer TSchema> ? RouteTree<SplitPath<TPath>, TMethod, OperationFor<TPath, TSchema>> : never;
type UnionToIntersection<TUnion> = (TUnion extends unknown ? (value: TUnion) => void : never) extends (value: infer TIntersection) => void ? TIntersection : never;
type ContractTestClient<TRoutes extends AnyContractRoute> = [TRoutes] extends [never] ? Record<never, never> : UnionToIntersection<TreeForRoute<TRoutes>>;
type ContractRoutesOf<TApp> = TApp extends Kozo<any, any, infer TRoutes> ? TRoutes : never;
declare function createFetchTestTransport(app: Kozo<any, any, any>): TestTransport;
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
declare function createTestClient<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>, TRoutes extends AnyContractRoute = never>(app: Kozo<TServices, TScoped, TRoutes>): TestClient<TServices>;
/**
 * Create a route-tree client whose inputs and JSON responses are derived from
 * the static contract carried by the app.
 */
declare function createContractTestClient<TServices extends Services, TScoped extends Record<string, unknown>, TRoutes extends AnyContractRoute>(app: Kozo<TServices, TScoped, TRoutes>): ContractTestClient<TRoutes>;
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
interface NativeTestClient<TServices extends Services = Services> extends TestClient<TServices> {
    /** Port the native (uWebSockets.js) server is listening on. */
    port: number;
    /** Shut the native server down. Always call this (e.g. in afterEach/afterAll). */
    close(): Promise<void>;
}
interface NativeTestTransport extends TestTransport {
    port: number;
    close(): Promise<void>;
}
type NativeContractTestClient<TRoutes extends AnyContractRoute> = ContractTestClient<TRoutes> & {
    readonly port: number;
    close(): Promise<void>;
};
/**
 * Start the native server and expose it through the same Request/Response
 * transport interface used by in-process contract tests.
 */
declare function createNativeTestTransport(app: Kozo<any, any, any>): Promise<NativeTestTransport>;
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
declare function createNativeTestClient<TServices extends Services = Services, TScoped extends Record<string, unknown> = Record<string, never>, TRoutes extends AnyContractRoute = never>(app: Kozo<TServices, TScoped, TRoutes>): Promise<NativeTestClient<TServices>>;
/**
 * Create the route-tree client against a real `nativeListen()` server.
 */
declare function createNativeContractTestClient<TServices extends Services, TScoped extends Record<string, unknown>, TRoutes extends AnyContractRoute>(app: Kozo<TServices, TScoped, TRoutes>): Promise<NativeContractTestClient<TRoutes>>;

export { type ContractRoutesOf, type ContractTestClient, type ContractTestResponse, type InjectOptions, type NativeContractTestClient, type NativeTestClient, type NativeTestTransport, type TestClient, type TestQueryPrimitive, type TestQueryValue, type TestResponse, type TestTransport, createContractTestClient, createFetchTestTransport, createNativeContractTestClient, createNativeTestClient, createNativeTestTransport, createTestApp, createTestClient };
