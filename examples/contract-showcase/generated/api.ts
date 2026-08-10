// Auto-generated Kozo Client
// Generated at 2026-08-10T13:45:38.804Z
// DO NOT EDIT - Changes will be overwritten

import { z } from 'zod';

// Type Definitions
export interface PostUsersInput {
  body: z.input<typeof PostUsersBodySchema>;
  init?: KozoRequestInit;
}
export type PostUsersResult = KozoClientResponse<201, z.output<typeof PostUsersResponse201Schema>>;
export interface UsersByIdInput {
  params: z.input<typeof UsersByIdParamsSchema> & { id: string | number | boolean };
  init?: KozoRequestInit;
}
export type UsersByIdResult = KozoClientResponse<200, z.output<typeof UsersByIdResponse200Schema>> | KozoClientResponse<404, z.output<typeof UsersByIdResponse404Schema>>;
export interface UsersInput {
  query?: z.input<typeof UsersQuerySchema>;
  init?: KozoRequestInit;
}
export type UsersResult = KozoClientResponse<200, z.output<typeof UsersResponse200Schema>>;
export interface PostProjectsInput {
  body: z.input<typeof PostProjectsBodySchema>;
  init?: KozoRequestInit;
}
export type PostProjectsResult = KozoClientResponse<201, z.output<typeof PostProjectsResponse201Schema>>;
export interface ProjectsByIdInput {
  params: z.input<typeof ProjectsByIdParamsSchema> & { id: string | number | boolean };
  init?: KozoRequestInit;
}
export type ProjectsByIdResult = KozoClientResponse<200, z.output<typeof ProjectsByIdResponse200Schema>> | KozoClientResponse<404, z.output<typeof ProjectsByIdResponse404Schema>>;
export interface AdminStatsInput {
  headers: z.input<typeof AdminStatsHeadersSchema>;
  init?: KozoRequestInit;
}
export type AdminStatsResult = KozoClientResponse<200, z.output<typeof AdminStatsResponse200Schema>> | KozoClientResponse<401, z.output<typeof AdminStatsResponse401Schema>>;
export type DocsResponse = unknown;
export interface DocsInput {
  init?: KozoRequestInit;
}
export type DocsResult = KozoClientResponse<number, unknown>;
export type DocsJsonResponse = unknown;
export interface DocsJsonInput {
  init?: KozoRequestInit;
}
export type DocsJsonResult = KozoClientResponse<number, unknown>;

// Zod Schemas
export const PostUsersBodySchema = z.object({ name: z.string(), email: z.string(), password: z.string(), active: z.boolean().optional().default(true), tags: z.array(z.string()).optional().default([]) });
export const PostUsersResponse201Schema = z.object({ id: z.string(), name: z.string(), email: z.string(), active: z.boolean(), tags: z.array(z.string()) });
/** @deprecated Use the status-specific response schemas. */
export const PostUsersResponseSchema = PostUsersResponse201Schema;
export const UsersByIdParamsSchema = z.object({ id: z.string() });
export const UsersByIdResponse200Schema = z.object({ id: z.string(), name: z.string(), email: z.string(), active: z.boolean(), tags: z.array(z.string()) });
export const UsersByIdResponse404Schema = z.object({ type: z.string(), title: z.string(), status: z.number(), detail: z.string(), instance: z.string().optional() });
/** @deprecated Use the status-specific response schemas. */
export const UsersByIdResponseSchema = UsersByIdResponse200Schema;
export const UsersQuerySchema = z.object({ page: z.number().default(1), active: z.enum(["true","false"]).optional(), tag: z.union([z.string(), z.array(z.string())]).optional() });
export const UsersResponse200Schema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), active: z.boolean(), tags: z.array(z.string()) })), page: z.number(), total: z.number() });
/** @deprecated Use the status-specific response schemas. */
export const UsersResponseSchema = UsersResponse200Schema;
export const PostProjectsBodySchema = z.object({ name: z.string(), ownerId: z.string() });
export const PostProjectsResponse201Schema = z.object({ id: z.string(), name: z.string(), ownerId: z.string() });
/** @deprecated Use the status-specific response schemas. */
export const PostProjectsResponseSchema = PostProjectsResponse201Schema;
export const ProjectsByIdParamsSchema = z.object({ id: z.string() });
export const ProjectsByIdResponse200Schema = z.object({ id: z.string(), name: z.string(), ownerId: z.string() });
export const ProjectsByIdResponse404Schema = z.object({ type: z.string(), title: z.string(), status: z.number(), detail: z.string(), instance: z.string().optional() });
/** @deprecated Use the status-specific response schemas. */
export const ProjectsByIdResponseSchema = ProjectsByIdResponse200Schema;
export const AdminStatsHeadersSchema = z.object({ authorization: z.string() });
export const AdminStatsResponse200Schema = z.object({ users: z.number(), projects: z.number() });
export const AdminStatsResponse401Schema = z.object({ type: z.string(), title: z.string(), status: z.number(), detail: z.string(), instance: z.string().optional() });
/** @deprecated Use the status-specific response schemas. */
export const AdminStatsResponseSchema = AdminStatsResponse200Schema;

/** Per-request overrides accepted by every client method. */
export interface KozoRequestInit {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export type KozoResponseOk<TStatus extends number> =
  number extends TStatus ? boolean :
  `${TStatus}` extends `2${string}` ? true : false;

/** A status-discriminated response returned by the route-tree client. */
export interface KozoClientResponse<TStatus extends number, TBody> {
  status: TStatus;
  headers: Headers;
  body: TBody;
  ok: KozoResponseOk<TStatus>;
}

function mergeHeaders(value: unknown, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined && item !== null) headers[key] = String(item);
    }
  }
  return { ...headers, ...extra };
}

function materializePath(routePath: string, value: unknown): string {
  const params = value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const output: string[] = [];
  for (const segment of routePath.split('/').filter(Boolean)) {
    if (segment.startsWith(':')) {
      const optional = segment.endsWith('?');
      const name = segment.slice(1, optional ? -1 : undefined);
      const item = params[name];
      if (item === undefined || item === null) {
        if (optional) continue;
        throw new TypeError('Missing path parameter "' + name + '" for route ' + routePath + '.');
      }
      output.push(encodeURIComponent(String(item)));
    } else if (segment === '*') {
      const item = params.wildcard;
      if (item === undefined || item === null) {
        throw new TypeError('Missing path parameter "wildcard" for route ' + routePath + '.');
      }
      output.push(...String(item).split('/').map(part => encodeURIComponent(part)));
    } else {
      output.push(segment);
    }
  }
  return output.length > 0 ? '/' + output.join('/') : '/';
}

function appendQuery(path: string, value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return path;
  const query = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    const values = Array.isArray(item) ? item : [item];
    for (const entry of values) {
      if (entry !== undefined && entry !== null) query.append(key, String(entry));
    }
  }
  const serialized = query.toString();
  return serialized ? path + '?' + serialized : path;
}

/** RFC 7807 problem details (application/problem+json). */
export interface KozoProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

/** Thrown on every non-2xx response. Carries the parsed body and RFC 7807 fields. */
export class KozoApiError extends Error {
  readonly status: number;
  readonly problem: KozoProblemDetails | null;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const problem = body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as KozoProblemDetails)
      : null;
    const title = problem && typeof problem.title === 'string' ? problem.title : null;
    const message = problem && typeof (problem as { message?: unknown }).message === 'string'
      ? (problem as { message: string }).message
      : null;
    super(title ?? message ?? 'API error ' + status);
    this.name = 'KozoApiError';
    this.status = status;
    this.problem = problem;
    this.body = body;
  }
}

/** Thrown when the server returns a status outside the generated contract. */
export class KozoUnexpectedResponseError extends KozoApiError {
  readonly declaredStatuses: readonly number[];

  constructor(status: number, body: unknown, declaredStatuses: readonly number[]) {
    super(status, body);
    this.name = 'KozoUnexpectedResponseError';
    this.declaredStatuses = declaredStatuses;
    this.message = 'Unexpected API status ' + status + '; declared statuses: ' + declaredStatuses.join(', ');
  }
}

export interface KozoClientOptions {
  baseUrl?: string;
  validateRequests?: boolean;
  defaultHeaders?: Record<string, string>;
  /** Bearer token provider, called per request; skipped when it returns null/undefined. */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Inspect/mutate url and headers right before the request is sent. */
  onRequest?: (req: { url: string; method: string; headers: Record<string, string> }) => void | Promise<void>;
  /** Called on 401 responses when a request was sent (e.g. clear session, redirect to login). */
  onUnauthorized?: (error: KozoApiError) => void | Promise<void>;
  /** Called before an HTTP or contract response error is thrown. */
  onError?: (error: KozoApiError) => void | Promise<void>;
  /** Custom fetch implementation (default: globalThis.fetch). */
  fetch?: typeof fetch;
}

export class KozoClient {
  private baseUrl: string;
  private validateRequests: boolean;
  private defaultHeaders: Record<string, string>;
  private getToken?: KozoClientOptions['getToken'];
  private onRequest?: KozoClientOptions['onRequest'];
  private onUnauthorized?: KozoClientOptions['onUnauthorized'];
  private onError?: KozoClientOptions['onError'];
  private fetchImpl: typeof fetch;

  constructor(options: KozoClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.validateRequests = options.validateRequests ?? false;
    this.defaultHeaders = options.defaultHeaders || {};
    this.getToken = options.getToken;
    this.onRequest = options.onRequest;
    this.onUnauthorized = options.onUnauthorized;
    this.onError = options.onError;
    this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  /** Shared transport: bearer auth, request hook, 204/non-JSON handling, RFC 7807 errors. */
  protected async request<T>(
    url: string,
    { method, body, signal, headers: extraHeaders }: { method: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<T> {
    const headers: Record<string, string> = { ...this.defaultHeaders, ...extraHeaders };
    if (body !== undefined && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const token = this.getToken ? await this.getToken() : null;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = { url, method, headers };
    if (this.onRequest) await this.onRequest(req);
    const response = await this.fetchImpl(req.url, {
      method,
      headers: req.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const data = response.status === 204
      ? null
      : contentType.includes('json')
        ? await response.json().catch(() => null)
        : await response.text();
    if (!response.ok) {
      const error = new KozoApiError(response.status, data);
      if (response.status === 401 && this.onUnauthorized) await this.onUnauthorized(error);
      if (this.onError) await this.onError(error);
      throw error;
    }
    return data as T;
  }

  /** @internal Used by the generated route-tree factory. */
  _kozoValidate(schema: { parse(value: unknown): unknown }, value: unknown): void {
    if (this.validateRequests) schema.parse(value);
  }

  /** @internal Used by the generated route-tree factory. */
  async _kozoRequestContract<T>(
    path: string,
    { method, body, signal, headers: extraHeaders }: { method: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> },
    declaredStatuses: readonly number[],
  ): Promise<T> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const headers: Record<string, string> = { ...this.defaultHeaders, ...extraHeaders };
    if (body !== undefined && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const token = this.getToken ? await this.getToken() : null;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = { url: base + path, method, headers };
    if (this.onRequest) await this.onRequest(req);
    const response = await this.fetchImpl(req.url, {
      method,
      headers: req.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const data = response.status === 204
      ? null
      : contentType.includes('json')
        ? await response.json().catch(() => null)
        : await response.text();
    const unexpected = declaredStatuses.length > 0
      ? !declaredStatuses.includes(response.status)
      : !response.ok;
    if (unexpected) {
      const error = new KozoUnexpectedResponseError(response.status, data, declaredStatuses);
      if (response.status === 401 && this.onUnauthorized) await this.onUnauthorized(error);
      if (this.onError) await this.onError(error);
      throw error;
    }
    return {
      status: response.status,
      headers: response.headers,
      body: data,
      ok: response.ok,
    } as T;
  }

  /** @deprecated Use api.users.post({ ... }) from createKozoClient(). */
  async postUsers(body: z.input<typeof PostUsersBodySchema>, init?: KozoRequestInit): Promise<z.output<typeof PostUsersResponse201Schema>> {
    if (this.validateRequests) PostUsersBodySchema.parse(body);
    let url = `${this.baseUrl}/users`;
    return this.request(url, { method: 'POST', body, signal: init?.signal, headers: init?.headers });
  }

  /** @deprecated Use api.users.$id.get({ ... }) from createKozoClient(). */
  async usersById(params: z.input<typeof UsersByIdParamsSchema> & { id: string | number | boolean }, init?: KozoRequestInit): Promise<z.output<typeof UsersByIdResponse200Schema>> {
    if (this.validateRequests) UsersByIdParamsSchema.parse(params);
    let url = this.baseUrl + materializePath("/users/:id", params);
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }

  /** @deprecated Use api.users.get({ ... }) from createKozoClient(). */
  async users(query?: z.input<typeof UsersQuerySchema>, init?: KozoRequestInit): Promise<z.output<typeof UsersResponse200Schema>> {
    if (this.validateRequests) UsersQuerySchema.parse(query ?? {});
    let url = `${this.baseUrl}/users`;
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item !== undefined && item !== null) qs.append(k, String(item));
          }
        } else if (v !== undefined && v !== null) {
          qs.append(k, String(v));
        }
      }
      const queryString = qs.toString();
      if (queryString) url += `?${queryString}`;
    }
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }

  /** @deprecated Use api.projects.post({ ... }) from createKozoClient(). */
  async postProjects(body: z.input<typeof PostProjectsBodySchema>, init?: KozoRequestInit): Promise<z.output<typeof PostProjectsResponse201Schema>> {
    if (this.validateRequests) PostProjectsBodySchema.parse(body);
    let url = `${this.baseUrl}/projects`;
    return this.request(url, { method: 'POST', body, signal: init?.signal, headers: init?.headers });
  }

  /** @deprecated Use api.projects.$id.get({ ... }) from createKozoClient(). */
  async projectsById(params: z.input<typeof ProjectsByIdParamsSchema> & { id: string | number | boolean }, init?: KozoRequestInit): Promise<z.output<typeof ProjectsByIdResponse200Schema>> {
    if (this.validateRequests) ProjectsByIdParamsSchema.parse(params);
    let url = this.baseUrl + materializePath("/projects/:id", params);
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }

  /** @deprecated Use api.admin.stats.get({ ... }) from createKozoClient(). */
  async adminStats(headers: z.input<typeof AdminStatsHeadersSchema>, init?: KozoRequestInit): Promise<z.output<typeof AdminStatsResponse200Schema>> {
    if (this.validateRequests) AdminStatsHeadersSchema.parse(headers ?? {});
    let url = `${this.baseUrl}/admin/stats`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: mergeHeaders(headers, init?.headers) });
  }

  /** @deprecated Use api.docs.get({ ... }) from createKozoClient(). */
  async docs(init?: KozoRequestInit): Promise<unknown> {
    let url = `${this.baseUrl}/docs`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }

  /** @deprecated Use api.docsJson.get({ ... }) from createKozoClient(). */
  async docsJson(init?: KozoRequestInit): Promise<unknown> {
    let url = `${this.baseUrl}/docs.json`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }
}

/** Create the preferred route-tree client from the generated contract. */
export function createKozoClient(options: KozoClientOptions = {}) {
  const transport = new KozoClient(options);
  return {
    "users": {
      "$id": {
        "get": async (input: UsersByIdInput): Promise<UsersByIdResult> => {
          transport._kozoValidate(UsersByIdParamsSchema, input.params);
          let path = materializePath("/users/:id", input.params);
          return transport._kozoRequestContract<UsersByIdResult>(
            path,
            { method: 'GET', signal: input.init?.signal, headers: input.init?.headers },
            [200,404],
          );
        }
      },
      "post": async (input: PostUsersInput): Promise<PostUsersResult> => {
        transport._kozoValidate(PostUsersBodySchema, input.body);
        let path = materializePath("/users", undefined);
        return transport._kozoRequestContract<PostUsersResult>(
          path,
          { method: 'POST', body: input.body, signal: input.init?.signal, headers: input.init?.headers },
          [201],
        );
      },
      "get": async (input: UsersInput = {}): Promise<UsersResult> => {
        transport._kozoValidate(UsersQuerySchema, input.query ?? {});
        let path = materializePath("/users", undefined);
        path = appendQuery(path, input.query);
        return transport._kozoRequestContract<UsersResult>(
          path,
          { method: 'GET', signal: input.init?.signal, headers: input.init?.headers },
          [200],
        );
      }
    },
    "projects": {
      "$id": {
        "get": async (input: ProjectsByIdInput): Promise<ProjectsByIdResult> => {
          transport._kozoValidate(ProjectsByIdParamsSchema, input.params);
          let path = materializePath("/projects/:id", input.params);
          return transport._kozoRequestContract<ProjectsByIdResult>(
            path,
            { method: 'GET', signal: input.init?.signal, headers: input.init?.headers },
            [200,404],
          );
        }
      },
      "post": async (input: PostProjectsInput): Promise<PostProjectsResult> => {
        transport._kozoValidate(PostProjectsBodySchema, input.body);
        let path = materializePath("/projects", undefined);
        return transport._kozoRequestContract<PostProjectsResult>(
          path,
          { method: 'POST', body: input.body, signal: input.init?.signal, headers: input.init?.headers },
          [201],
        );
      }
    },
    "admin": {
      "stats": {
        "get": async (input: AdminStatsInput): Promise<AdminStatsResult> => {
          transport._kozoValidate(AdminStatsHeadersSchema, input.headers ?? {});
          let path = materializePath("/admin/stats", undefined);
          return transport._kozoRequestContract<AdminStatsResult>(
            path,
            { method: 'GET', signal: input.init?.signal, headers: mergeHeaders(input.headers, input.init?.headers) },
            [200,401],
          );
        }
      }
    },
    "docs": {
      "get": async (input: DocsInput = {}): Promise<DocsResult> => {
        let path = materializePath("/docs", undefined);
        return transport._kozoRequestContract<DocsResult>(
          path,
          { method: 'GET', signal: input.init?.signal, headers: input.init?.headers },
          [],
        );
      }
    },
    "docsJson": {
      "get": async (input: DocsJsonInput = {}): Promise<DocsJsonResult> => {
        let path = materializePath("/docs.json", undefined);
        return transport._kozoRequestContract<DocsJsonResult>(
          path,
          { method: 'GET', signal: input.init?.signal, headers: input.init?.headers },
          [],
        );
      }
    }
  };
}

export type KozoRouteClient = ReturnType<typeof createKozoClient>;

export default KozoClient;
