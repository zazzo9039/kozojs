import { describe, expect, it } from 'vitest';
import { createNativeContractTestClient } from '@kozojs/testing';
import { createContractShowcaseApp } from '../src/app.js';

const nativeTransportPackage: string = 'uWebSockets.js';
const hasNativeTransport = await import(nativeTransportPackage)
  .then(() => true)
  .catch(() => false);

describe.skipIf(!hasNativeTransport)('native contract client', () => {
  it('runs the same typed route tree over real HTTP', async () => {
    const client = await createNativeContractTestClient(createContractShowcaseApp());
    try {
      const created = await client.users.post({
        body: {
          name: 'Margaret',
          email: 'margaret@example.com',
          password: 'apollo-guidance',
        },
      });
      expect(created.status).toBe(201);

      const detail = await client.users.$id.get({
        params: { id: created.json().id },
      });
      expect(detail.status).toBe(200);
      if (detail.status !== 200) throw new Error('Expected the created user');
      expect(detail.json().name).toBe('Margaret');
    } finally {
      await client.close();
    }
  });

  it('applies guards on the native transport', async () => {
    const client = await createNativeContractTestClient(createContractShowcaseApp());
    try {
      const denied = await client.admin.stats.get({
        headers: { authorization: 'Bearer invalid' },
      });
      expect(denied.status).toBe(401);
      if (denied.status !== 401) throw new Error('Expected a guard denial');
      expect(denied.json().detail).toContain('invalid bearer token');
    } finally {
      await client.close();
    }
  });
});
