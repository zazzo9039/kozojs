// ============================================================================
// Tests for client-generator.ts — generateTypedClient
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { generateTypedClient, type RouteInfo } from '../src/client-generator.js';

describe('generateTypedClient', () => {
  it('generates code for a simple GET route', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users', schema: {} },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('class KozoClient');
    expect(code).toContain('async users(');
    expect(code).toContain("method: 'GET'");
  });

  it('generates code for POST with body schema', () => {
    const bodySchema = z.object({ name: z.string(), age: z.number() });
    const routes: RouteInfo[] = [
      { method: 'post', path: '/users', schema: { body: bodySchema }, zodSchemas: { body: bodySchema } },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('postUsers');
    expect(code).toContain('body:');
    expect(code).toContain("method: 'POST'");
    expect(code).toContain('JSON.stringify(body)');
  });

  it('handles path parameters', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users/:id', schema: {} },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('async usersById(');
    expect(code).toContain('params: { id: string | number | boolean }');
    expect(code).toContain(
      'this.baseUrl + materializePath("/users/:id", params)',
    );
    expect(code).toContain('"$id": {');
    expect(code).toContain('"get": async (input: UsersByIdInput)');
  });

  it('generates readable camelCase names for nested and dashed routes', () => {
    const routes: RouteInfo[] = [
      { method: 'patch', path: '/user-profiles/:userId', schema: {} },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('async patchUserProfilesByUserId(');
    expect(code).not.toContain('patchUser_Profiles');
    expect(code).toContain('"userProfiles": {');
    expect(code).toContain('"$userId": {');
    expect(code).toContain('"patch": async');
  });

  it('protects generated client internals from GET route name collisions', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/request', schema: {} },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('async getRequest(');
  });

  it('fails clearly when two routes generate the same method name', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users/:id', schema: {} },
      { method: 'get', path: '/users-by-id', schema: {} },
    ];
    expect(() => generateTypedClient(routes)).toThrow(
      'GET /users/:id and GET /users-by-id both map to "usersById"',
    );
  });

  it('handles query parameters', () => {
    const querySchema = z.object({
      page: z.number(),
      tag: z.array(z.string()).optional(),
    });
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users', schema: { query: querySchema }, zodSchemas: { query: querySchema } },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('query?:');
    expect(code).toContain('URLSearchParams');
    expect(code).toContain('qs.append(k, String(item))');
  });

  it('handles response schema', () => {
    const responseSchema = z.object({ id: z.number(), name: z.string() });
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users', schema: { response: { 200: responseSchema } }, zodSchemas: { response: responseSchema } },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('ResponseSchema');
  });

  it('selects the first successful response when 200 is not declared', () => {
    const createdSchema = z.object({ id: z.string() });
    const routes: RouteInfo[] = [
      {
        method: 'post',
        path: '/users',
        schema: { response: { 201: createdSchema } },
      },
    ];

    const code = generateTypedClient(routes);
    expect(code).toContain(
      'export const PostUsersResponse201Schema = z.object({ id: z.string() });',
    );
    expect(code).toContain(
      'export const PostUsersResponseSchema = PostUsersResponse201Schema;',
    );
    expect(code).toContain(
      'PostUsersResult = KozoClientResponse<201, z.output<typeof PostUsersResponse201Schema>>',
    );
    expect(code).not.toContain('export const PostUsersResponseSchema = z.any()');
  });

  it('generates a route tree with status-discriminated response unions', () => {
    const okSchema = z.object({ id: z.string(), name: z.string() });
    const missingSchema = z.object({ message: z.string() });
    const routes: RouteInfo[] = [
      {
        method: 'get',
        path: '/users/:id',
        schema: {
          params: z.object({ id: z.string() }),
          response: {
            200: okSchema,
            404: missingSchema,
          },
        },
      },
    ];

    const code = generateTypedClient(routes);
    expect(code).toContain('export function createKozoClient(');
    expect(code).toContain('"users": {');
    expect(code).toContain('"$id": {');
    expect(code).toContain('"get": async (input: UsersByIdInput)');
    expect(code).toContain('KozoClientResponse<200, z.output<typeof UsersByIdResponse200Schema>>');
    expect(code).toContain('KozoClientResponse<404, z.output<typeof UsersByIdResponse404Schema>>');
    expect(code).toContain('[200,404]');
  });

  it('fails clearly when route-tree segments normalize to the same key', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/user-profiles', schema: {} },
      { method: 'post', path: '/user_profiles', schema: {} },
    ];

    expect(() => generateTypedClient(routes)).toThrow(
      'route segments "user-profiles" and "user_profiles" both normalize to "userProfiles"',
    );
  });

  it('supports optional and wildcard path parameters in both client APIs', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/assets/:folder?/*', schema: {} },
    ];

    const code = generateTypedClient(routes);
    expect(code).toContain(
      'params: { folder?: string | number | boolean; wildcard: string | number | boolean }',
    );
    expect(code).toContain('"$folder": {');
    expect(code).toContain('"$wildcard": {');
    expect(code).toContain(
      'this.baseUrl + materializePath("/assets/:folder?/*", params)',
    );
  });

  it('preserves a route operation when an HTTP verb is also a path segment', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users', schema: {} },
      { method: 'get', path: '/users/get/details', schema: {} },
    ];

    const code = generateTypedClient(routes);
    expect(code).toContain('"get": Object.assign(');
    expect(code).toContain('"details": {');
  });

  it('uses custom baseUrl', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/health', schema: {} },
    ];
    const code = generateTypedClient(routes, { baseUrl: 'https://api.example.com' });
    expect(code).toContain('https://api.example.com');
  });

  it('skips validation imports when includeValidation is false', () => {
    const bodySchema = z.object({ name: z.string() });
    const routes: RouteInfo[] = [
      { method: 'post', path: '/users', schema: { body: bodySchema }, zodSchemas: { body: bodySchema } },
    ];
    const code = generateTypedClient(routes, { includeValidation: false });
    expect(code).not.toContain("import { z }");
    expect(code).not.toContain('z.infer');
  });

  it('generates all HTTP methods', () => {
    const routes: RouteInfo[] = [
      { method: 'get', path: '/a', schema: {} },
      { method: 'post', path: '/b', schema: {} },
      { method: 'put', path: '/c', schema: {} },
      { method: 'patch', path: '/d', schema: {} },
      { method: 'delete', path: '/e', schema: {} },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain("method: 'GET'");
    expect(code).toContain("method: 'POST'");
    expect(code).toContain("method: 'PUT'");
    expect(code).toContain("method: 'PATCH'");
    expect(code).toContain("method: 'DELETE'");
  });

  it('generates valid TypeScript (no syntax errors)', () => {
    const bodySchema = z.object({ name: z.string() });
    const responseSchema = z.object({ id: z.number() });
    const routes: RouteInfo[] = [
      {
        method: 'post',
        path: '/users/:orgId',
        schema: { body: bodySchema, response: { 200: responseSchema } },
        zodSchemas: { body: bodySchema, response: responseSchema },
      },
    ];
    const code = generateTypedClient(routes);
    // Basic checks: balanced braces
    const opens = (code.match(/{/g) || []).length;
    const closes = (code.match(/}/g) || []).length;
    expect(opens).toBe(closes);
  });

  it('handles nested Zod schemas in zodToString (falls back gracefully)', () => {
    const schema = z.object({
      tags: z.array(z.string()),
      address: z.object({ city: z.string(), zip: z.string() }),
      status: z.enum(['active', 'inactive']),
      score: z.number().optional(),
      verified: z.boolean().nullable(),
    });
    const routes: RouteInfo[] = [
      { method: 'post', path: '/items', schema: { body: schema }, zodSchemas: { body: schema } },
    ];
    const code = generateTypedClient(routes);
    // zodToString now correctly introspects Zod v4 schemas
    expect(code).toContain('PostItemsBodySchema');
    expect(code).toContain('z.array(z.string())');
    expect(code).toContain('z.enum(');
    expect(code).toContain('z.enum(["active","inactive"])');
    expect(code).toContain('z.number()');
    expect(code).toContain('class KozoClient');
  });

  it('handles defaultHeaders option', () => {
    const routes: RouteInfo[] = [{ method: 'get', path: '/test', schema: {} }];
    const code = generateTypedClient(routes, { defaultHeaders: { 'X-Api-Key': 'abc' } });
    expect(code).toContain('X-Api-Key');
  });

  it('handles empty routes', () => {
    const code = generateTypedClient([]);
    expect(code).toContain('class KozoClient');
  });

  it('zodToString warns for unsupported Zod types (z.nan())', () => {
    // z.nan() has type 'nan' in Zod v4 — not handled in the switch → default fallback
    const schema = z.nan();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const routes: RouteInfo[] = [
      { method: 'post', path: '/items', schema: { body: schema as any }, zodSchemas: { body: schema as any } },
    ];
    const code = generateTypedClient(routes);

    // Falls back to z.any() and emits a warning
    expect(code).toContain('z.any()');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Kozo] zodToString'));
    warnSpy.mockRestore();
  });
});

describe('zodToString: zod v4 record', () => {
  it('emits the two-argument z.record(key, value) form', () => {
    const bodySchema = z.object({ overrides: z.record(z.string(), z.boolean()) });
    const routes: RouteInfo[] = [
      { method: 'post', path: '/r', schema: { body: bodySchema }, zodSchemas: { body: bodySchema } },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('z.record(z.string(), z.boolean())');
    expect(code).not.toMatch(/z\.record\(z\.boolean\(\)\)/);
  });
});
