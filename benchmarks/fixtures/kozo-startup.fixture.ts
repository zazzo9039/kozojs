import { createKozo } from '@kozojs/core';
import { serve } from '@hono/node-server';
import { z } from 'zod';

export async function setupKozoStartup(): Promise<{ port: number; server: any }> {
  const app = createKozo({});

  app.get('/bench/hello', {
    response: z.object({ message: z.string() }),
  }, () => ({ message: 'Hello from service' }));

  app.get('/bench/simple', {
    response: z.object({ message: z.string() }),
  }, () => ({ message: 'Simple response' }));

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      resolve({ port: info.port, server });
    });
  });
}
