import { describe, expect, it } from 'vitest';
import { createKozo, createRouter, z } from '@kozojs/core';
import { createContractTestClient } from '../src/index.js';

function buildApp() {
  const users = createRouter()
    .post('/', {
      body: z.object({
        name: z.string(),
        internal: z.string().optional(),
      }),
      response: {
        201: z.object({
          id: z.string(),
          name: z.string(),
        }),
      },
    }, ({ body, json }) => json({
      id: 'user-1',
      name: body.name,
      internal: body.internal,
    }, 201))
    .get('/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({
        active: z.preprocess(
          value => value === 'true' ? true : value === 'false' ? false : value,
          z.boolean(),
        ).optional(),
        page: z.coerce.number().optional(),
        tag: z.union([z.string(), z.array(z.string())]).optional(),
      }),
      headers: z.object({
        'x-trace-id': z.string().optional(),
      }),
      response: {
        200: z.object({
          id: z.string(),
          active: z.boolean(),
          page: z.number(),
          tags: z.array(z.string()),
          traceId: z.string().nullable(),
        }),
        404: z.object({ detail: z.string() }),
      },
    }, ({ params, query, headers, c, json }) => {
      if (params.id === 'missing') {
        return json({ detail: 'User not found' }, 404);
      }
      return json({
        id: params.id,
        active: query.active ?? false,
        page: query.page ?? 0,
        tags: new URL(c.req.url).searchParams.getAll('tag'),
        traceId: headers['x-trace-id'] ?? null,
      }, 200);
    });

  return createKozo()
    .get('/health', {
      response: z.object({ ok: z.boolean() }),
    }, () => ({ ok: true }))
    .get('/plain', {}, ({ text }) => text('plain response'))
    .mount('/users', users);
}

describe('createContractTestClient', () => {
  it('exposes the registered route tree without string paths', async () => {
    const client = createContractTestClient(buildApp());
    const response = await client.health.get();

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.json()).toEqual({ ok: true });
  });

  it('builds encoded params, repeated query keys, and typed headers', async () => {
    const client = createContractTestClient(buildApp());
    const response = await client.users.$id.get({
      params: { id: 'a/b' },
      query: {
        active: false,
        page: 0,
        tag: ['runtime', 'types'],
      },
      headers: { 'x-trace-id': 'trace-1' },
    });

    expect(response.status).toBe(200);
    expect(response.json()).toEqual({
      id: 'a/b',
      active: false,
      page: 0,
      tags: ['runtime', 'types'],
      traceId: 'trace-1',
    });
  });

  it('returns status-discriminated responses and strips undeclared fields', async () => {
    const client = createContractTestClient(buildApp());
    const created = await client.users.post({
      body: { name: 'Ada', internal: 'do-not-serialize' },
    });

    expect(created.status).toBe(201);
    expect(created.ok).toBe(true);
    expect(created.json()).toEqual({ id: 'user-1', name: 'Ada' });

    const missing = await client.users.$id.get({
      params: { id: 'missing' },
    });
    expect(missing.status).toBe(404);
    expect(missing.ok).toBe(false);
    expect(missing.json()).toEqual({ detail: 'User not found' });
  });

  it('keeps the same clear JSON parse error as the low-level client', async () => {
    const client = createContractTestClient(buildApp()) as any;
    const response = await client.plain.get();
    expect(response.status).toBe(200);
    expect(() => response.json()).toThrow('Failed to parse response body as JSON');
  });

  it('rejects deterministic segment normalization collisions', () => {
    const app = createKozo();
    app.get('/user-profiles', {}, () => ({ source: 'dash' }));
    app.get('/user_profiles', {}, () => ({ source: 'underscore' }));

    expect(() => createContractTestClient(app)).toThrow(
      'route segments "user-profiles" and "user_profiles" both normalize to "userProfiles"',
    );
  });

  it('rejects unsupported route segment characters instead of silently renaming', () => {
    const app = createKozo();
    app.get('/users@internal', {}, () => ({ ok: true }));
    expect(() => createContractTestClient(app)).toThrow('contains unsupported characters');
  });
});
