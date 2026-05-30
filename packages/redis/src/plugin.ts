import type { RedisPluginOptions, KozoRedis } from './types.js';
import { createRedis } from './client.js';

/**
 * Kozo plugin that creates a KozoRedis instance and wires shutdown.
 *
 * ```ts
 * import { redisPlugin } from '@kozojs/redis';
 *
 * app.use(redisPlugin({
 *   connection: process.env.REDIS_URL ?? 'redis://localhost:6379',
 *   prefix: 'myapp:',
 * }));
 * ```
 *
 * The plugin registers a cleanup hook so Redis connections
 * are closed during graceful shutdown (after draining HTTP requests).
 */
export function redisPlugin(options: RedisPluginOptions & { onReady?: (redis: KozoRedis) => void }) {
  const { connection, prefix = 'kozo:', closeTimeout = 5_000, onReady } = options;
  let instance: KozoRedis | undefined;

  return {
    name: '@kozojs/redis',
    version: '0.1.0',

    async install(app: any) {
      instance = await createRedis({ connection, prefix });

      // Register shutdown cleanup
      app.getShutdownManager().addCleanupHook(async () => {
        if (!instance) return;
        await Promise.race([
          instance.close(),
          new Promise<void>((resolve) => setTimeout(resolve, closeTimeout)),
        ]);
      });

      // Callback so the user can store the instance in services
      onReady?.(instance);
    },
  };
}
