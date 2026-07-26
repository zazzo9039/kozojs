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
});
