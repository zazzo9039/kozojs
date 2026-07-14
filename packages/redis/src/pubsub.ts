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
  const patternHandlers = new Map<string, Set<PubSubHandler>>();

  function dispatch(set: Set<PubSubHandler> | undefined, channel: string, message: string): void {
    if (!set) return;
    let data: unknown;
    try { data = JSON.parse(message); }
    catch { data = message; }
    for (const fn of set) {
      try { fn(data, channel); }
      catch (err) { console.error(`[kozo:redis] pubsub handler error on "${channel}":`, err); }
    }
  }

  function ensureSubscriber(): any {
    if (subscriber) return subscriber;
    subscriber = createSubscriber();
    // Exact-channel messages
    subscriber.on('message', (channel: string, message: string) => {
      dispatch(handlers.get(channel), channel, message);
    });
    // Pattern messages — keyed by the subscribed pattern, dispatched with the
    // concrete channel that matched.
    subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      dispatch(patternHandlers.get(pattern), channel, message);
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

    psubscribe<T = unknown>(pattern: string, handler: PubSubHandler<T>): () => void {
      if (!patternHandlers.has(pattern)) {
        patternHandlers.set(pattern, new Set());
        ensureSubscriber().psubscribe(pattern);
      }
      const set = patternHandlers.get(pattern)!;
      set.add(handler as PubSubHandler);

      // Return unsubscribe function
      return () => {
        set.delete(handler as PubSubHandler);
        if (set.size === 0) {
          patternHandlers.delete(pattern);
          subscriber?.punsubscribe(pattern);
        }
      };
    },
  };
}

/** Close the subscriber connection if it exists. */
export function closeSubscriber(sub: any): Promise<void> {
  return sub?.quit?.().catch(() => {}) ?? Promise.resolve();
}
