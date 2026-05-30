import type { Plugin, Kozo } from '@kozojs/core';
import type { QueuePluginOptions } from './types.js';

/**
 * Kozo Plugin that wires queue adapters into graceful shutdown.
 *
 * Uses Kozo's ShutdownManager to register a cleanup hook that:
 * 1. Closes all registered adapters (drains in-flight jobs)
 * 2. Force-closes after closeTimeout ms to prevent hangs
 */
export function queuePlugin(options: QueuePluginOptions = {}): Plugin {
  return {
    name: '@kozojs/queue',
    version: '0.3.0',
    install(app: Kozo) {
      const timeout = options.closeTimeout ?? 5_000;

      const cleanup = async () => {
        const closeTasks: Promise<void>[] = [];

        if (options.adapters) {
          closeTasks.push(...options.adapters.map((a) => a.close()));
        }

        await Promise.race([
          Promise.all(closeTasks),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('@kozojs/queue: close timeout exceeded')),
              timeout,
            ),
          ),
        ]).catch((err: Error) => {
          console.warn('[kozo:queue]', err.message, '— forcing close');
        });
      };

      // Integrate with Kozo's shutdown lifecycle
      const sm = app.getShutdownManager();
      sm.addCleanupHook(cleanup);
    },
  };
}
