import { describe, expect, it } from 'vitest';
import { createNativeTestClient } from '@kozojs/testing';
import { createApp } from '../src/app.js';

const nativePackage: string = 'uWebSockets.js';
const hasNative = await import(nativePackage).then(() => true).catch(() => false);

describe.skipIf(!hasNative)('native guard', () => {
  it('denies an unauthenticated native request', async () => {
    const client = await createNativeTestClient(createApp());
    try {
      const denied = await client.get('/admin/health');
      expect(denied.status).toBe(401);
    } finally {
      await client.close();
    }
  });
});
