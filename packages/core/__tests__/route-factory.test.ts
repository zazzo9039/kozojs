// ============================================================================
// Tests for createRouteFactory — typed defineRoute without global augmentation
// ============================================================================

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createKozo } from '../src/app.js';
import { createRouteFactory } from '../src/types.js';

interface TestServices {
  greeter: { hello(name: string): string };
  [key: string]: unknown;
}

const { defineRoute } = createRouteFactory<TestServices>();

describe('createRouteFactory', () => {
  it('produces a definition the app serves with typed services', async () => {
    const def = defineRoute({
      schema: { body: z.object({ name: z.string() }) },
      handler: ({ body, services }) => ({ msg: services.greeter.hello(body.name) }),
    });

    const app = createKozo<TestServices>({
      services: { greeter: { hello: (n) => `ciao ${n}` } },
    });
    app.post('/hello', def.schema!, def.handler, def.meta);

    const res = await app.fetch(
      new Request('http://t.local/hello', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'kozo' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ciao kozo' });
  });

  it('still validates the body via the schema', async () => {
    const def = defineRoute({
      schema: { body: z.object({ name: z.string() }) },
      handler: ({ body, services }) => services.greeter.hello(body.name),
    });
    const app = createKozo<TestServices>({
      services: { greeter: { hello: (n) => n } },
    });
    app.post('/hello', def.schema!, def.handler, def.meta);

    const res = await app.fetch(
      new Request('http://t.local/hello', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 42 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('keeps meta on the definition', () => {
    const def = defineRoute({ meta: { auth: false }, handler: () => 'ok' });
    expect(def.meta?.auth).toBe(false);
  });

  it('rejects unknown services at compile time', () => {
    defineRoute({
      handler: ({ services }) => {
        // @ts-expect-error — "mailer" does not exist on TestServices
        return services.mailer.send();
      },
    });
    expect(true).toBe(true);
  });
});
