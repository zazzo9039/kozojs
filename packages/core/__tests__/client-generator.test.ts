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
    expect(code).toContain('params: { id: string }');
    expect(code).toContain('${params.id}');
  });

  it('handles query parameters', () => {
    const querySchema = z.object({ page: z.number() });
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users', schema: { query: querySchema }, zodSchemas: { query: querySchema } },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('query?:');
    expect(code).toContain('URLSearchParams');
  });

  it('handles response schema', () => {
    const responseSchema = z.object({ id: z.number(), name: z.string() });
    const routes: RouteInfo[] = [
      { method: 'get', path: '/users', schema: { response: { 200: responseSchema } }, zodSchemas: { response: responseSchema } },
    ];
    const code = generateTypedClient(routes);
    expect(code).toContain('ResponseSchema');
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
