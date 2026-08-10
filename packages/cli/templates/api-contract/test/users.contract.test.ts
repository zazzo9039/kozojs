import { describe, expect, it } from 'vitest';
import { createContractTestClient, createTestClient } from '@kozojs/testing';
import { createApp } from '../src/app.js';

describe('users contract', () => {
  it('shares typed inputs and responses', async () => {
    const client = createContractTestClient(createApp());
    const created = await client.users.post({ body: { name: 'Ada', email: 'ada@example.com' } });
    expect(created.status).toBe(201);
    const detail = await client.users.$id.get({ params: { id: created.json().id } });
    expect(detail.status).toBe(200);
  });

  it('accepts deliberately invalid input only through the raw client', async () => {
    const response = await createTestClient(createApp()).post('/users', { name: '', email: 'invalid' });
    expect(response.status).toBe(400);
  });
});
