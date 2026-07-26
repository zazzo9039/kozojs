import type {
  HttpMethod,
  KozoHandler,
  RouteMeta,
  RouteSchema,
  Services,
} from './types.js';

/**
 * Compile-time description of one registered HTTP route.
 *
 * The handler is intentionally not part of this type: consumers only need the
 * method, literal path, and schemas to derive clients and test helpers.
 */
export interface ContractRoute<
  TMethod extends HttpMethod = HttpMethod,
  TPath extends string = string,
  TSchema extends RouteSchema = RouteSchema,
> {
  readonly method: TMethod;
  readonly path: TPath;
  readonly schema: TSchema;
}

export type AnyContractRoute = ContractRoute<HttpMethod, string, RouteSchema>;

type TrimLeadingSlash<TPath extends string> =
  TPath extends `/${infer TRest}` ? TrimLeadingSlash<TRest> : TPath;

type TrimTrailingSlash<TPath extends string> =
  TPath extends `${infer TRest}/` ? TrimTrailingSlash<TRest> : TPath;

type TrimSlashes<TPath extends string> = TrimTrailingSlash<TrimLeadingSlash<TPath>>;

/**
 * Join a route prefix and child path with exactly one leading separator.
 */
export type JoinRoutePaths<
  TPrefix extends string,
  TPath extends string,
  TPrefixPart extends string = TrimSlashes<TPrefix>,
  TPathPart extends string = TrimSlashes<TPath>,
> = TPrefixPart extends ''
  ? TPathPart extends '' ? '/' : `/${TPathPart}`
  : TPathPart extends '' ? `/${TPrefixPart}` : `/${TPrefixPart}/${TPathPart}`;

export type PrefixContractRoutes<
  TPrefix extends string,
  TRoutes extends AnyContractRoute,
> = TRoutes extends ContractRoute<
  infer TMethod,
  infer TPath,
  infer TSchema
>
  ? ContractRoute<TMethod, JoinRoutePaths<TPrefix, TPath>, TSchema>
  : never;

interface ContractRouteRegistration<TServices extends Services> {
  method: HttpMethod;
  path: string;
  schema: RouteSchema;
  handler: KozoHandler<any, TServices>;
  meta?: RouteMeta;
}

/**
 * Normalize and join paths at runtime using the same rules as
 * {@link JoinRoutePaths}.
 */
export function joinRoutePaths(prefix: string, path: string): string {
  const prefixPart = prefix.replace(/^\/+|\/+$/g, '');
  const pathPart = path.replace(/^\/+|\/+$/g, '');
  if (!prefixPart) return pathPart ? `/${pathPart}` : '/';
  return pathPart ? `/${prefixPart}/${pathPart}` : `/${prefixPart}`;
}

/**
 * Fluent, statically typed collection of Kozo routes.
 *
 * Capture the returned value (normally by chaining calls) so TypeScript can
 * retain the accumulated route union.
 */
export class RouteContract<
  TServices extends Services = Services,
  TRoutes extends AnyContractRoute = never,
> {
  private readonly registrations: ContractRouteRegistration<TServices>[] = [];

  get<const TPath extends string>(
    path: TPath,
    handler: KozoHandler<{}, TServices>,
  ): RouteContract<TServices, TRoutes | ContractRoute<'get', TPath, {}>>;
  get<const TPath extends string, const TSchema extends RouteSchema>(
    path: TPath,
    schema: TSchema,
    handler: KozoHandler<TSchema, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, TRoutes | ContractRoute<'get', TPath, TSchema>>;
  get(
    path: string,
    schemaOrHandler: RouteSchema | KozoHandler<{}, TServices>,
    handler?: KozoHandler<any, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, any> {
    return this.add('get', path, schemaOrHandler, handler, meta);
  }

  post<const TPath extends string>(
    path: TPath,
    handler: KozoHandler<{}, TServices>,
  ): RouteContract<TServices, TRoutes | ContractRoute<'post', TPath, {}>>;
  post<const TPath extends string, const TSchema extends RouteSchema>(
    path: TPath,
    schema: TSchema,
    handler: KozoHandler<TSchema, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, TRoutes | ContractRoute<'post', TPath, TSchema>>;
  post(
    path: string,
    schemaOrHandler: RouteSchema | KozoHandler<{}, TServices>,
    handler?: KozoHandler<any, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, any> {
    return this.add('post', path, schemaOrHandler, handler, meta);
  }

  put<const TPath extends string>(
    path: TPath,
    handler: KozoHandler<{}, TServices>,
  ): RouteContract<TServices, TRoutes | ContractRoute<'put', TPath, {}>>;
  put<const TPath extends string, const TSchema extends RouteSchema>(
    path: TPath,
    schema: TSchema,
    handler: KozoHandler<TSchema, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, TRoutes | ContractRoute<'put', TPath, TSchema>>;
  put(
    path: string,
    schemaOrHandler: RouteSchema | KozoHandler<{}, TServices>,
    handler?: KozoHandler<any, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, any> {
    return this.add('put', path, schemaOrHandler, handler, meta);
  }

  patch<const TPath extends string>(
    path: TPath,
    handler: KozoHandler<{}, TServices>,
  ): RouteContract<TServices, TRoutes | ContractRoute<'patch', TPath, {}>>;
  patch<const TPath extends string, const TSchema extends RouteSchema>(
    path: TPath,
    schema: TSchema,
    handler: KozoHandler<TSchema, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, TRoutes | ContractRoute<'patch', TPath, TSchema>>;
  patch(
    path: string,
    schemaOrHandler: RouteSchema | KozoHandler<{}, TServices>,
    handler?: KozoHandler<any, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, any> {
    return this.add('patch', path, schemaOrHandler, handler, meta);
  }

  delete<const TPath extends string>(
    path: TPath,
    handler: KozoHandler<{}, TServices>,
  ): RouteContract<TServices, TRoutes | ContractRoute<'delete', TPath, {}>>;
  delete<const TPath extends string, const TSchema extends RouteSchema>(
    path: TPath,
    schema: TSchema,
    handler: KozoHandler<TSchema, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, TRoutes | ContractRoute<'delete', TPath, TSchema>>;
  delete(
    path: string,
    schemaOrHandler: RouteSchema | KozoHandler<{}, TServices>,
    handler?: KozoHandler<any, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, any> {
    return this.add('delete', path, schemaOrHandler, handler, meta);
  }

  private add(
    method: HttpMethod,
    path: string,
    schemaOrHandler: RouteSchema | KozoHandler<{}, TServices>,
    handler?: KozoHandler<any, TServices>,
    meta?: RouteMeta,
  ): RouteContract<TServices, any> {
    if (typeof schemaOrHandler === 'function') {
      this.registrations.push({
        method,
        path,
        schema: {},
        handler: schemaOrHandler,
      });
    } else {
      this.registrations.push({
        method,
        path,
        schema: schemaOrHandler,
        handler: handler!,
        meta,
      });
    }
    return this;
  }
}

/** Create an empty route contract. Capture route additions through chaining. */
export function createRouter<TServices extends Services = Services>(): RouteContract<TServices> {
  return new RouteContract<TServices>();
}

/** Descriptive alias for {@link createRouter}. */
export const defineRoutes = createRouter;

/** @internal Used by Kozo.mount(); not exported from the package entrypoint. */
export function getContractRouteRegistrations<TServices extends Services>(
  contract: RouteContract<TServices, AnyContractRoute>,
): ReadonlyArray<ContractRouteRegistration<TServices>> {
  return (contract as unknown as {
    registrations: ContractRouteRegistration<TServices>[];
  }).registrations;
}

