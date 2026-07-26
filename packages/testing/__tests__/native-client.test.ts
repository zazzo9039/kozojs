// ============================================================================
// createNativeTestClient — real round-trip over the uWebSockets.js transport
// ============================================================================
//
// Skipped when uWebSockets.js is not installed (same policy as core's parity
// tests). When present, this boots the app with nativeListen() and asserts a
// native-path behavior (ctx.header) that the Hono-only createTestClient can't
// observe.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createKozo, z } from '@kozojs/core';
import { createNativeTestClient } from '../src/index.js';

let uwsAvailable = false;
try {
  const { createRequire } = await import('node:module');
  createRequire(import.meta.url)('uWebSockets.js');
  uwsAvailable = true;
} catch {
  /* native transport not installed — suite skipped */
}

describe.skipIf(!uwsAvailable)('createNativeTestClient', () => {
  it('routes requests through the native transport and applies ctx.header()', async () => {
    const app = createKozo({ logger: false });
    app.get('/ping', {}, (ctx) => {
      ctx.header('X-Transport', 'uws');
      return { pong: true };
    });
    app.post('/echo', { body: z.object({ msg: z.string() }) }, (ctx) => ({ echo: ctx.body.msg }));
    app.post('/raw', {}, async ({ req }) => ({
      contentType: req.header('content-type') ?? null,
      body: await req.text(),
    }));

    const client = await createNativeTestClient(app);
    try {
      expect(client.port).toBeGreaterThan(0);

      const res = await client.get('/ping');
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ pong: true });
      // ctx.header() only reaches the wire on the native path if the uWS context
      // supports it — the exact behavior createTestClient (Hono) can't cover.
      expect(res.headers.get('x-transport')).toBe('uws');

      const echo = await client.post('/echo', { msg: 'hi' });
      expect(echo.status).toBe(200);
      expect(echo.json()).toEqual({ echo: 'hi' });

      const bad = await client.post('/echo', { msg: 123 });
      expect(bad.status).toBe(400);

      const binary = await client.post('/raw', new Uint8Array([75, 111, 122, 111]));
      expect(binary.json()).toEqual({ contentType: null, body: 'Kozo' });
    } finally {
      await client.close();
    }
  });
});
