// Auto-generated Kozo Client
// Generated at 2026-07-26T22:40:48.642Z
// DO NOT EDIT - Changes will be overwritten

import { z } from 'zod';

// Type Definitions
export type DocsResponse = unknown;
export type DocsJsonResponse = unknown;

// Zod Schemas
export const PostUsersBodySchema = z.object({ name: z.string(), email: z.string(), password: z.string(), active: z.boolean().optional().default(true), tags: z.array(z.string()).optional().default([]) });
export const PostUsersResponseSchema = z.object({ id: z.string(), name: z.string(), email: z.string(), active: z.boolean(), tags: z.array(z.string()) });
export const UsersByIdResponseSchema = z.object({ id: z.string(), name: z.string(), email: z.string(), active: z.boolean(), tags: z.array(z.string()) });
export const UsersQuerySchema = z.object({ page: z.number().default(1), active: z.enum(["true","false"]).optional(), tag: z.union([z.string(), z.array(z.string())]).optional() });
export const UsersResponseSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), active: z.boolean(), tags: z.array(z.string()) })), page: z.number(), total: z.number() });
export const PostProjectsBodySchema = z.object({ name: z.string(), ownerId: z.string() });
export const PostProjectsResponseSchema = z.object({ id: z.string(), name: z.string(), ownerId: z.string() });
export const ProjectsByIdResponseSchema = z.object({ id: z.string(), name: z.string(), ownerId: z.string() });
export const AdminStatsHeadersSchema = z.object({ authorization: z.string() });
export const AdminStatsResponseSchema = z.object({ users: z.number(), projects: z.number() });

/** Per-request overrides accepted by every client method. */
export interface KozoRequestInit {
  signal?: AbortSignal;
  headers?: Record<string, string>;
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
  /** Called for every non-2xx response, before the KozoApiError is thrown. */
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

  async postUsers(body: z.infer<typeof PostUsersBodySchema>, init?: KozoRequestInit): Promise<z.infer<typeof PostUsersResponseSchema>> {
    if (this.validateRequests && PostUsersBodySchema) {
      PostUsersBodySchema.parse(body);
    }
    let url = `${this.baseUrl}/users`;
    return this.request(url, { method: 'POST', body, signal: init?.signal, headers: init?.headers });
  }

  async usersById(params: { id: string }, init?: KozoRequestInit): Promise<z.infer<typeof UsersByIdResponseSchema>> {
    let url = `${this.baseUrl}/users/${encodeURIComponent(String(params.id))}`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }

  async users(query?: z.infer<typeof UsersQuerySchema>, init?: KozoRequestInit): Promise<z.infer<typeof UsersResponseSchema>> {
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

  async postProjects(body: z.infer<typeof PostProjectsBodySchema>, init?: KozoRequestInit): Promise<z.infer<typeof PostProjectsResponseSchema>> {
    if (this.validateRequests && PostProjectsBodySchema) {
      PostProjectsBodySchema.parse(body);
    }
    let url = `${this.baseUrl}/projects`;
    return this.request(url, { method: 'POST', body, signal: init?.signal, headers: init?.headers });
  }

  async projectsById(params: { id: string }, init?: KozoRequestInit): Promise<z.infer<typeof ProjectsByIdResponseSchema>> {
    let url = `${this.baseUrl}/projects/${encodeURIComponent(String(params.id))}`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }

  async adminStats(headers: z.infer<typeof AdminStatsHeadersSchema>, init?: KozoRequestInit): Promise<z.infer<typeof AdminStatsResponseSchema>> {
    if (this.validateRequests && AdminStatsHeadersSchema) {
      AdminStatsHeadersSchema.parse(headers);
    }
    let url = `${this.baseUrl}/admin/stats`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: { ...headers, ...init?.headers } });
  }

  async docs(init?: KozoRequestInit): Promise<unknown> {
    let url = `${this.baseUrl}/docs`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }

  async docsJson(init?: KozoRequestInit): Promise<unknown> {
    let url = `${this.baseUrl}/docs.json`;
    return this.request(url, { method: 'GET', signal: init?.signal, headers: init?.headers });
  }
}

export default KozoClient;
