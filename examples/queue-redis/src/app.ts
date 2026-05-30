/**
 * Minimal consumer for @kozojs/redis (cache) + @kozojs/queue (BullMQ).
 * Requires Redis running locally — see README.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKozo } from '@kozojs/core';
import { logger } from '@kozojs/core';
import { createQueue, queuePlugin } from '@kozojs/queue';
import { createRedis, type KozoRedis } from '@kozojs/redis';
import type { QueueAdapter } from '@kozojs/queue';

export type NotifyJob = { message: string };

export type AppServices = {
  redis: KozoRedis;
  jobQueue: QueueAdapter<NotifyJob>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const routesDir = path.join(__dirname, 'routes');

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export async function buildApp() {
  const redis = await createRedis({ connection: REDIS_URL, prefix: 'kozo-example:' });
  const jobQueue = createQueue<NotifyJob>('notifications', {
    adapter: 'redis',
    connection: REDIS_URL,
  });

  const app = createKozo<AppServices>({
    routesDir,
    services: { redis, jobQueue },
  });

  app.middleware(logger());
  app.use(queuePlugin({ adapters: [jobQueue] }));

  app.getShutdownManager().addCleanupHook(async () => {
    await redis.close();
  });

  await app.loadRoutes();
  return { app, jobQueue };
}
