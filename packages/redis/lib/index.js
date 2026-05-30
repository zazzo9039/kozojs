// src/cache.ts
function createCache(redis, prefix) {
  function k(key) {
    return prefix + key;
  }
  return {
    async get(key) {
      const raw = await redis.get(k(key));
      if (raw === null) return void 0;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    async set(key, value, ttlSeconds) {
      const serialized = JSON.stringify(value);
      if (ttlSeconds != null && ttlSeconds > 0) {
        await redis.set(k(key), serialized, "EX", Math.ceil(ttlSeconds));
      } else {
        await redis.set(k(key), serialized);
      }
    },
    async del(...keys) {
      if (keys.length === 0) return 0;
      return redis.del(...keys.map(k));
    },
    async has(key) {
      return await redis.exists(k(key)) === 1;
    },
    async ttl(key) {
      return redis.ttl(k(key));
    }
  };
}

// src/pubsub.ts
function createPubSub(publishRedis, createSubscriber) {
  let subscriber;
  const handlers = /* @__PURE__ */ new Map();
  function ensureSubscriber() {
    if (subscriber) return subscriber;
    subscriber = createSubscriber();
    subscriber.on("message", (channel, message) => {
      const set = handlers.get(channel);
      if (!set) return;
      let data;
      try {
        data = JSON.parse(message);
      } catch {
        data = message;
      }
      for (const fn of set) {
        try {
          fn(data, channel);
        } catch (err) {
          console.error(`[kozo:redis] pubsub handler error on "${channel}":`, err);
        }
      }
    });
    return subscriber;
  }
  return {
    async publish(channel, data) {
      return publishRedis.publish(channel, JSON.stringify(data));
    },
    subscribe(channel, handler) {
      if (!handlers.has(channel)) {
        handlers.set(channel, /* @__PURE__ */ new Set());
        ensureSubscriber().subscribe(channel);
      }
      const set = handlers.get(channel);
      set.add(handler);
      return () => {
        set.delete(handler);
        if (set.size === 0) {
          handlers.delete(channel);
          subscriber?.unsubscribe(channel);
        }
      };
    }
  };
}
function closeSubscriber(sub) {
  return sub?.quit?.().catch(() => {
  }) ?? Promise.resolve();
}

// src/rate-limit-store.ts
function createRateLimitStore(redis, prefix) {
  function k(key) {
    return prefix + "rl:" + key;
  }
  const LUA_INCREMENT = `
    local key = KEYS[1]
    local windowMs = tonumber(ARGV[1])
    local count = redis.call('INCR', key)
    if count == 1 then
      redis.call('PEXPIRE', key, windowMs)
    end
    local pttl = redis.call('PTTL', key)
    return {count, pttl}
  `;
  return {
    async increment(key, windowMs) {
      const [count, pttl] = await redis.eval(LUA_INCREMENT, 1, k(key), windowMs);
      const resetAt = Date.now() + Math.max(pttl, 0);
      return { count, resetAt };
    },
    async reset(key) {
      await redis.del(k(key));
    }
  };
}

// src/client.ts
async function createRedis(config) {
  const { connection, prefix = "", lazyConnect = true } = config;
  const Redis = await import("ioredis").then(
    (m) => m.default ?? m,
    () => {
      throw new Error(
        "[kozo:redis] ioredis is required. Install it: npm install ioredis"
      );
    }
  );
  const client = typeof connection === "string" ? new Redis(connection, { lazyConnect }) : new Redis({ ...connection, lazyConnect });
  if (lazyConnect) await client.connect();
  let subscriberRef;
  const createSubscriber = () => {
    subscriberRef = client.duplicate();
    return subscriberRef;
  };
  const cache = createCache(client, prefix);
  const pubsub = createPubSub(client, createSubscriber);
  const rateLimit = createRateLimitStore(client, prefix);
  return {
    cache,
    pubsub,
    rateLimit,
    raw: client,
    async close() {
      await closeSubscriber(subscriberRef);
      await client.quit().catch(() => {
      });
    }
  };
}

// src/plugin.ts
function redisPlugin(options) {
  const { connection, prefix = "kozo:", closeTimeout = 5e3, onReady } = options;
  let instance;
  return {
    name: "@kozojs/redis",
    version: "0.1.0",
    async install(app) {
      instance = await createRedis({ connection, prefix });
      app.getShutdownManager().addCleanupHook(async () => {
        if (!instance) return;
        await Promise.race([
          instance.close(),
          new Promise((resolve) => setTimeout(resolve, closeTimeout))
        ]);
      });
      onReady?.(instance);
    }
  };
}
export {
  createCache,
  createPubSub,
  createRateLimitStore,
  createRedis,
  redisPlugin
};
