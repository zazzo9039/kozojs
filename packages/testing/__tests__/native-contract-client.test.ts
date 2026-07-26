import { describe, expect, it } from 'vitest';
import { createKozo, z } from '@kozojs/core';
import { createNativeContractTestClient } from '../src/index.js';

let uwsAvailable = false;
try {
  const { createRequire } = await import('node:module');
  createRequire(import.meta.url)('uWebSockets.js');
  uwsAvailable = true;
} catch {
  /* native transport not installed — suite skipped */
}

function buildApp() {
  return createKozo({ logger: false })
    .get('/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({
        active: z.preprocess(
          value => value === 'true' ? true : value === 'false' ? false : value,
          z.boolean(),
        ),
      }),
      headers: z.object({ 'x-trace-id': z.string().min(1) }),
      response: {
        200: z.object({
          id: z.string(),
          active: z.boolean(),
          traceId: z.string(),
        }),
        404: z.object({ detail: z.string() }),
      },
    }, ({ params, query, headers, json }) => {
      if (params.id === 'missing') return json({ detail: 'Not found' }, 404);
      return json({
        id: params.id,
        active: query.active,
        traceId: headers['x-trace-id'],
        privateValue: 'strip-me',
      }, 200);
    })
    .post('/items', {
      body: z.object({ name: z.string() }),
      response: {
        201: z.object({ id: z.string(), name: z.string() }),
      },
    }, ({ body, json }) => json({
      id: 'item-1',
      name: body.name,
      privateValue: 'strip-me',
    }, 201));
}

describe.skipIf(!uwsAvailable)('createNativeContractTestClient', () => {
  it('uses the same route tree and request builder over native HTTP', async () => {
    const client = await createNativeContractTestClient(buildApp());
    try {
      expect(client.port).toBeGreaterThan(0);
      const response = await client.items.$id.get({
        params: { id: 'a/b' },
        query: { active: false },
        headers: { 'x-trace-id': 'native-trace' },
      });

      expect(response.status).toBe(200);
      expect(response.json()).toEqual({
        id: 'a/b',
        active: false,
        traceId: 'native-trace',
      });
    } finally {
      await client.close();
    }
  });

  it('preserves validation failures and status-specific serializers', async () => {
    const client = await createNativeContractTestClient(buildApp());
    try {
      const invalid = await client.items.$id.get({
        params: { id: 'item-1' },
        query: { active: true },
        headers: { 'x-trace-id': '' },
      });
      expect(invalid.status).toBe(400);

      const missing = await client.items.$id.get({
        params: { id: 'missing' },
        query: { active: true },
        headers: { 'x-trace-id': 'trace' },
      });
      expect(missing.status).toBe(404);
      expect(missing.json()).toEqual({ detail: 'Not found' });

      const created = await client.items.post({ body: { name: 'Kozo' } });
      expect(created.status).toBe(201);
      expect(created.json()).toEqual({ id: 'item-1', name: 'Kozo' });
    } finally {
      await client.close();
    }
  });
});
