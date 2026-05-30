// ============================================================================
// Tests for openapi.ts — OpenAPIGenerator, generateSwaggerHtml, factory
// ============================================================================

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  OpenAPIGenerator,
  createOpenAPIGenerator,
  generateSwaggerHtml,
  type OpenAPIConfig,
} from '../src/openapi.js';
import type { RouteDefinition } from '../src/types.js';

// ── helpers ──────────────────────────────────────────────────────────────

const baseConfig: OpenAPIConfig = {
  info: { title: 'Test API', version: '1.0.0' },
};

function makeRoute(overrides: Partial<RouteDefinition> & { path: string; method: string }): RouteDefinition {
  return {
    filePath: '/fake/' + overrides.path,
    module: {
      default: () => new Response('ok'),
      ...overrides.module,
    },
    ...overrides,
  } as RouteDefinition;
}

// ── OpenAPIGenerator ─────────────────────────────────────────────────────

describe('OpenAPIGenerator', () => {
  // -- basic spec structure --

  it('returns a valid 3.1.0 spec shell', () => {
    const gen = new OpenAPIGenerator(baseConfig);
    const spec = gen.generate([]);

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info).toEqual(baseConfig.info);
    expect(spec.paths).toEqual({});
    expect(spec.components.schemas).toEqual({});
    expect(spec.components.securitySchemes).toBeDefined();
    expect(spec.components.securitySchemes!.bearerAuth.type).toBe('http');
  });

  it('passes servers, tags, and security from config', () => {
    const config: OpenAPIConfig = {
      info: { title: 'T', version: '0' },
      servers: [{ url: 'http://localhost:3000', description: 'dev' }],
      tags: [{ name: 'Users', description: 'User endpoints' }],
      security: [{ bearerAuth: [] }],
    };
    const spec = new OpenAPIGenerator(config).generate([]);
    expect(spec.servers).toEqual(config.servers);
    expect(spec.tags).toEqual(config.tags);
    expect(spec.security).toEqual(config.security);
  });

  // -- path conversion --

  it('converts Hono :param to OpenAPI {param}', () => {
    const route = makeRoute({ path: '/users/:id/posts/:postId', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    expect(spec.paths['/users/{id}/posts/{postId}']).toBeDefined();
  });

  // -- operation generation --

  it('generates operationId from path + method', () => {
    const route = makeRoute({ path: '/users/:id', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const op = spec.paths['/users/{id}'].get;
    expect(op.operationId).toBe('getUsersById');
  });

  it('uses meta summary / description / tags when present', () => {
    const route = makeRoute({
      path: '/items',
      method: 'get',
      module: {
        default: () => {},
        meta: { summary: 'List items', description: 'Paginated list', tags: ['Items'] },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const op = spec.paths['/items'].get;
    expect(op.summary).toBe('List items');
    expect(op.description).toBe('Paginated list');
    expect(op.tags).toEqual(['Items']);
  });

  it('falls back to method + path as summary when no meta', () => {
    const route = makeRoute({ path: '/health', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    expect(spec.paths['/health'].get.summary).toBe('GET /health');
  });

  it('extracts first segment as default tag', () => {
    const route = makeRoute({ path: '/orders/recent', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    expect(spec.paths['/orders/recent'].get.tags).toEqual(['Orders']);
  });

  it('uses "Default" tag for root path', () => {
    const route = makeRoute({ path: '/', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    expect(spec.paths['/'].get.tags).toEqual(['Default']);
  });

  // -- path parameters --

  it('adds path parameters from :param segments', () => {
    const route = makeRoute({ path: '/users/:userId', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const params = spec.paths['/users/{userId}'].get.parameters!;
    expect(params).toHaveLength(1);
    expect(params[0]).toMatchObject({ name: 'userId', in: 'path', required: true, schema: { type: 'string' } });
  });

  it('overrides path param schema when schema.params provided', () => {
    const route = makeRoute({
      path: '/users/:id',
      method: 'get',
      module: {
        default: () => {},
        schema: { params: z.object({ id: z.number().int() }) },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const params = spec.paths['/users/{id}'].get.parameters!;
    const idParam = params.find((p: any) => p.name === 'id' && p.in === 'path');
    expect(idParam).toBeDefined();
    expect(idParam!.schema.type).toBe('integer');
  });

  // -- query parameters --

  it('adds query parameters from schema.query', () => {
    const route = makeRoute({
      path: '/search',
      method: 'get',
      module: {
        default: () => {},
        schema: {
          query: z.object({
            q: z.string(),
            page: z.number().int().optional(),
          }),
        },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const params = spec.paths['/search'].get.parameters!;
    const qParam = params.find((p: any) => p.name === 'q');
    const pageParam = params.find((p: any) => p.name === 'page');
    expect(qParam).toBeDefined();
    expect(qParam!.in).toBe('query');
    expect(qParam!.required).toBe(true);
    expect(pageParam).toBeDefined();
    expect(pageParam!.required).toBe(false);
  });

  // -- request body --

  it('adds request body for POST routes with schema.body', () => {
    const route = makeRoute({
      path: '/users',
      method: 'post',
      module: {
        default: () => {},
        schema: { body: z.object({ name: z.string(), email: z.string().email() }) },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const op = spec.paths['/users'].post;
    expect(op.requestBody).toBeDefined();
    expect(op.requestBody!.required).toBe(true);
    const bodySchema = op.requestBody!.content['application/json'].schema;
    expect(bodySchema.type).toBe('object');
    expect(bodySchema.properties).toHaveProperty('name');
    expect(bodySchema.properties).toHaveProperty('email');
  });

  it('adds request body for PUT and PATCH methods', () => {
    for (const method of ['put', 'patch'] as const) {
      const route = makeRoute({
        path: '/items/:id',
        method,
        module: {
          default: () => {},
          schema: { body: z.object({ title: z.string() }) },
        },
      });
      const spec = new OpenAPIGenerator(baseConfig).generate([route]);
      const op = spec.paths['/items/{id}'][method];
      expect(op.requestBody).toBeDefined();
    }
  });

  it('does NOT add request body for GET even with body schema', () => {
    const route = makeRoute({
      path: '/items',
      method: 'get',
      module: {
        default: () => {},
        schema: { body: z.object({ x: z.number() }) },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    expect(spec.paths['/items'].get.requestBody).toBeUndefined();
  });

  // -- response schemas --

  it('adds response schemas from schema.response object', () => {
    const route = makeRoute({
      path: '/users',
      method: 'get',
      module: {
        default: () => {},
        schema: {
          response: {
            200: z.object({ id: z.string(), name: z.string() }),
            404: z.object({ error: z.string() }),
          },
        },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const responses = spec.paths['/users'].get.responses;
    expect(responses['200']).toBeDefined();
    expect(responses['200'].description).toBe('OK');
    expect(responses['404']).toBeDefined();
    expect(responses['404'].description).toBe('Not Found');
  });

  it('handles unknown status codes with generic description', () => {
    const route = makeRoute({
      path: '/custom',
      method: 'get',
      module: {
        default: () => {},
        schema: { response: { 418: z.object({ teapot: z.boolean() }) } },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    expect(spec.paths['/custom'].get.responses['418'].description).toBe('Response');
  });

  // -- auth --

  it('adds security requirement when meta.auth is true', () => {
    const route = makeRoute({
      path: '/protected',
      method: 'get',
      module: {
        default: () => {},
        meta: { auth: true },
      },
    });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const op = spec.paths['/protected'].get;
    expect(op.security).toEqual([{ bearerAuth: [] }]);
  });

  it('does not add security when meta.auth is falsy', () => {
    const route = makeRoute({ path: '/public', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    expect(spec.paths['/public'].get.security).toBeUndefined();
  });

  // -- multiple routes --

  it('groups methods under the same path', () => {
    const routes = [
      makeRoute({ path: '/items', method: 'get', module: { default: () => {} } }),
      makeRoute({ path: '/items', method: 'post', module: { default: () => {} } }),
    ];
    const spec = new OpenAPIGenerator(baseConfig).generate(routes);
    expect(spec.paths['/items'].get).toBeDefined();
    expect(spec.paths['/items'].post).toBeDefined();
  });

  // -- default responses --

  it('always includes 200, 400, 500 default responses', () => {
    const route = makeRoute({ path: '/x', method: 'get', module: { default: () => {} } });
    const spec = new OpenAPIGenerator(baseConfig).generate([route]);
    const res = spec.paths['/x'].get.responses;
    expect(res['200']).toBeDefined();
    expect(res['400']).toBeDefined();
    expect(res['500']).toBeDefined();
  });

  // -- status descriptions --

  it('returns correct descriptions for common status codes', () => {
    const descs: Record<number, string> = {
      200: 'OK', 201: 'Created', 204: 'No Content',
      400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
      404: 'Not Found', 500: 'Internal Server Error',
    };
    const routes = Object.keys(descs).map((status) =>
      makeRoute({
        path: `/s${status}`,
        method: 'get',
        module: {
          default: () => {},
          schema: { response: { [Number(status)]: z.object({ ok: z.boolean() }) } },
        },
      })
    );
    const spec = new OpenAPIGenerator(baseConfig).generate(routes);
    for (const [status, desc] of Object.entries(descs)) {
      const resp = spec.paths[`/s${status}`].get.responses[status];
      expect(resp.description, `status ${status}`).toBe(desc);
    }
  });
});

// ── generateSwaggerHtml ─────────────────────────────────────────────────

describe('generateSwaggerHtml', () => {
  it('produces an HTML string with swagger-ui', () => {
    const html = generateSwaggerHtml('/openapi.json');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('swagger-ui');
    expect(html).toContain('/openapi.json');
  });

  it('uses the provided title', () => {
    const html = generateSwaggerHtml('/spec.json', 'My API Docs');
    expect(html).toContain('My API Docs');
  });

  it('uses default title when none provided', () => {
    const html = generateSwaggerHtml('/spec.json');
    expect(html).toContain('API Documentation');
  });

  it('sanitizes spec URL to prevent XSS', () => {
    const html = generateSwaggerHtml('"><script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sanitizes title to prevent XSS', () => {
    const html = generateSwaggerHtml('/spec.json', '<img onerror=alert(1)>');
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror');
  });
});

// ── createOpenAPIGenerator (factory) ─────────────────────────────────────

describe('createOpenAPIGenerator', () => {
  it('returns an OpenAPIGenerator instance', () => {
    const gen = createOpenAPIGenerator(baseConfig);
    expect(gen).toBeInstanceOf(OpenAPIGenerator);
  });

  it('returned instance generates valid specs', () => {
    const gen = createOpenAPIGenerator({
      info: { title: 'Factory Test', version: '2.0.0', description: 'desc' },
    });
    const spec = gen.generate([]);
    expect(spec.info.title).toBe('Factory Test');
    expect(spec.info.version).toBe('2.0.0');
    expect(spec.info.description).toBe('desc');
  });
});
