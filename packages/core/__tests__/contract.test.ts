import { describe, expect, it } from 'vitest';
import { createKozo, createRouter, z } from '../src/index.js';
import { joinRoutePaths } from '../src/contract.js';

describe('route contracts', () => {
  it('mounts a typed router below a normalized prefix', async () => {
    const users = createRouter()
      .get('/', {
        query: z.object({ active: z.coerce.boolean().optional() }),
        response: z.object({ users: z.array(z.string()) }),
      }, ({ query }) => ({ users: query.active === false ? [] : ['Ada'] }))
      .get('/:id', {
        params: z.object({ id: z.string() }),
        response: z.object({ id: z.string() }),
      }, ({ params }) => ({ id: params.id }));

    const app = createKozo().mount('/api/users/', users);

    expect(app.getRoutes().map(({ method, path }) => `${method} ${path}`)).toEqual([
      'get /api/users',
      'get /api/users/:id',
    ]);

    const list = await app.fetch(new Request('http://localhost/api/users?active=true'));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ users: ['Ada'] });

    const detail = await app.fetch(new Request('http://localhost/api/users/abc'));
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual({ id: 'abc' });
  });

  it('normalizes every supported prefix and child path combination', () => {
    expect(joinRoutePaths('/api', '/users')).toBe('/api/users');
    expect(joinRoutePaths('/api/', '/users')).toBe('/api/users');
    expect(joinRoutePaths('/api', 'users')).toBe('/api/users');
    expect(joinRoutePaths('/', '/users')).toBe('/users');
    expect(joinRoutePaths('', '/users')).toBe('/users');
    expect(joinRoutePaths('/api', '/')).toBe('/api');
    expect(joinRoutePaths('', '')).toBe('/');
  });

  it('normalizes legacy groups and supports nested runtime groups', async () => {
    const app = createKozo();
    app.group('/api/', (api) => {
      api.group('/users/', (users) => {
        users.get('/:id', { params: z.object({ id: z.string() }) }, ({ params }) => params);
      });
    });

    expect(app.getRoutes()[0]?.path).toBe('/api/users/:id');
    const response = await app.fetch(new Request('http://localhost/api/users/42'));
    expect(await response.json()).toEqual({ id: '42' });
  });
});

describe('validated request headers', () => {
  const traceId = '4b5a73a7-6fde-4a39-b5dd-444f726c42c2';

  function buildApp() {
    return createKozo().get('/trace', {
      headers: z.object({
        'x-trace-id': z.string().uuid(),
        'x-attempt': z.coerce.number().int().positive().optional(),
      }),
      response: z.object({
        traceId: z.string().uuid(),
        attempt: z.number(),
      }),
    }, ({ headers }) => ({
      traceId: headers['x-trace-id'],
      attempt: headers['x-attempt'] ?? 1,
    }));
  }

  it('validates and exposes parsed headers to handlers', async () => {
    const app = buildApp();
    const response = await app.fetch(new Request('http://localhost/trace', {
      headers: {
        'x-trace-id': traceId,
        'x-attempt': '2',
      },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ traceId, attempt: 2 });
  });

  it('returns a structured validation error for missing headers', async () => {
    const response = await buildApp().fetch(new Request('http://localhost/trace'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      title: 'Validation Failed',
      errors: [expect.objectContaining({ field: 'x-trace-id' })],
    });
  });

  it('projects header schemas into OpenAPI and generated clients', async () => {
    const app = buildApp();
    app.mountDocs({ path: '/docs', enabled: true });

    const specResponse = await app.fetch(new Request('http://localhost/docs.json'));
    const spec = await specResponse.json() as any;
    expect(spec.paths['/trace'].get.parameters).toContainEqual(expect.objectContaining({
      name: 'x-trace-id',
      in: 'header',
      required: true,
    }));

    const client = app.generateClient();
    expect(client).toContain('TraceHeadersSchema');
    expect(client).toContain('headers: z.infer<typeof TraceHeadersSchema>');
    expect(client).toContain('headers: { ...headers, ...init?.headers }');
  });
});
