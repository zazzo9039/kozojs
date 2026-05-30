import type { KozoPubSub, PubSubHandler } from './types.js';

/**
 * Create a pub/sub layer that uses a dedicated ioredis subscriber connection.
 *
 * ioredis requires a separate connection for subscriptions because
 * a connection in subscribe mode can't execute regular commands.
 * We create the subscriber lazily on first subscribe() call.
 */
export function createPubSub(publishRedis: any, createSubscriber: () => any): KozoPubSub {
  let subscriber: any | undefined;
  const handlers = new Map<string, Set<PubSubHandler>>();

  function ensureSubscriber(): any {
    if (subscriber) return subscriber;
    subscriber = createSubscriber();
    subscriber.on('message', (channel: string, message: string) => {
      const set = handlers.get(channel);
      if (!set) return;
      let data: unknown;
      try { data = JSON.parse(message); }
      catch { data = message; }
      for (const fn of set) {
        try { fn(data, channel); }
        catch (err) { console.error(`[kozo:redis] pubsub handler error on "${channel}":`, err); }
      }
    });
    return subscriber;
  }

  return {
    async publish<T = unknown>(channel: string, data: T): Promise<number> {
      return publishRedis.publish(channel, JSON.stringify(data));
    },

    subscribe<T = unknown>(channel: string, handler: PubSubHandler<T>): () => void {
      if (!handlers.has(channel)) {
        handlers.set(channel, new Set());
        ensureSubscriber().subscribe(channel);
      }
      const set = handlers.get(channel)!;
      set.add(handler as PubSubHandler);

      // Return unsubscribe function
      return () => {
        set.delete(handler as PubSubHandler);
        if (set.size === 0) {
          handlers.delete(channel);
          subscriber?.unsubscribe(channel);
        }
      };
    },
  };
}

/** Close the subscriber connection if it exists. */
export function closeSubscriber(sub: any): Promise<void> {
  return sub?.quit?.().catch(() => {}) ?? Promise.resolve();
}
