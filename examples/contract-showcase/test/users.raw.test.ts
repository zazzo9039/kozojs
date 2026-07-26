import { describe, expect, it } from 'vitest';
import { createTestClient } from '@kozojs/testing';
import { createContractShowcaseApp } from '../src/app.js';

describe('raw client', () => {
  it('can deliberately send an invalid payload', async () => {
    const client = createTestClient(createContractShowcaseApp());
    const response = await client.post('/users', {
      name: '',
      email: 'not-an-email',
      password: 'short',
    });

    expect(response.status).toBe(400);
  });

  it('exercises guard denials without weakening contract types', async () => {
    const client = createTestClient(createContractShowcaseApp());
    const response = await client.get('/admin/stats');

    expect(response.status).toBe(401);
    expect(response.json()).toEqual({
      message: 'Missing or invalid bearer token',
    });
  });

  it('publishes OpenAPI and generates an SDK from the same routes', async () => {
    const app = createContractShowcaseApp();
    const client = createTestClient(app);

    const spec = await client.get('/docs.json');
    expect(spec.status).toBe(200);
    expect(spec.json<{ paths: Record<string, unknown> }>().paths).toHaveProperty('/users/{id}');

    const generated = app.generateClient({
      baseUrl: 'http://localhost:3000',
    });
    expect(generated).toContain('export class KozoClient');
    expect(generated).toContain('async usersById');
    expect(generated).toContain('authorization');
  });
});
