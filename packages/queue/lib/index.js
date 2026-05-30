// src/connection.ts
function resolveRedisConnection(conn) {
  if (typeof conn !== "string") return conn;
  if (!conn.startsWith("redis://") && !conn.startsWith("rediss://")) {
    throw new Error(
      `[kozo:queue] Invalid Redis URL: "${conn}". Expected a redis:// or rediss:// URL, or an ioredis options object.`
    );
  }
  const url = new URL(conn);
  const result = {
    host: url.hostname || "localhost",
    port: url.port ? parseInt(url.port, 10) : 6379,
    username: url.username || void 0,
    password: url.password || void 0,
    db: url.pathname ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
    tls: url.protocol === "rediss:" ? {} : void 0
  };
  return result;
}
function resolveAmqpConnection(conn) {
  if (typeof conn !== "string") return conn;
  if (!conn.startsWith("amqp://") && !conn.startsWith("amqps://")) {
    throw new Error(
      `[kozo:queue] Invalid AMQP URL: "${conn}". Expected an amqp:// or amqps:// URL, or an options object.`
    );
  }
  new URL(conn);
  return conn;
}

// src/adapters/redis.ts
function createRedisAdapter(queueName, config) {
  const connection = resolveRedisConnection(config.connection);
  let bullmqPromise;
  function getBullMQ() {
    if (!bullmqPromise) {
      bullmqPromise = import("bullmq").catch((e) => {
        throw new Error(
          "[kozo:queue] bullmq is required for the Redis adapter. Install it: npm install bullmq",
          { cause: e }
        );
      });
    }
    return bullmqPromise;
  }
  let queue;
  let worker;
  let queueEvents;
  const pendingErrorListeners = [];
  async function ensureQueue() {
    if (queue) return queue;
    const { Queue } = await getBullMQ();
    queue = new Queue(queueName, {
      ...config.bullmq,
      connection,
      defaultJobOptions: config.defaultJobOptions ?? {
        attempts: 3,
        backoff: { type: "exponential", delay: 1e3 },
        removeOnComplete: { count: 1e3 },
        removeOnFail: { count: 5e3 }
      }
    });
    return queue;
  }
  function wrapJob(job) {
    return {
      id: job.id ?? "",
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      raw: job
    };
  }
  let queueEventsPromise;
  function ensureQueueEvents() {
    if (queueEvents) return Promise.resolve(queueEvents);
    if (!queueEventsPromise) {
      queueEventsPromise = (async () => {
        const { QueueEvents } = await getBullMQ();
        queueEvents = new QueueEvents(queueName, { connection });
        return queueEvents;
      })();
    }
    return queueEventsPromise;
  }
  const adapter = {
    name: "redis",
    queueName,
    async add(jobName, data, options) {
      const q = await ensureQueue();
      const opts = {};
      if (options?.delay != null) opts.delay = options.delay;
      if (options?.attempts != null) opts.attempts = options.attempts;
      if (options?.priority != null) opts.priority = options.priority;
      if (options?.jobId != null) opts.jobId = options.jobId;
      const job = await q.add(jobName, data, opts);
      return job.id ?? "";
    },
    async process(handler, options) {
      if (worker) throw new Error(`[kozo:queue] Worker already started for "${queueName}"`);
      const { Worker } = await getBullMQ();
      worker = new Worker(
        queueName,
        async (job) => handler(wrapJob(job)),
        { connection, concurrency: options?.concurrency ?? 1 }
      );
      for (const fn of pendingErrorListeners) {
        worker.on("error", fn);
      }
      pendingErrorListeners.length = 0;
    },
    on(event, listener) {
      if (event === "error") {
        if (worker) {
          worker.on("error", listener);
          return () => {
            worker?.off("error", listener);
          };
        }
        pendingErrorListeners.push(listener);
        return () => {
          const idx = pendingErrorListeners.indexOf(listener);
          if (idx >= 0) pendingErrorListeners.splice(idx, 1);
          worker?.off("error", listener);
        };
      }
      if (event === "completed") {
        const bullListener = async ({ jobId }) => {
          const q = await ensureQueue();
          const job = await q.getJob(jobId);
          if (job) listener(wrapJob(job));
        };
        ensureQueueEvents().then((qe) => qe.on("completed", bullListener));
        return () => {
          ensureQueueEvents().then((qe) => qe.off("completed", bullListener));
        };
      }
      if (event === "failed") {
        const bullListener = async ({ jobId, failedReason }) => {
          const q = await ensureQueue();
          const job = await q.getJob(jobId);
          const kozoJob = job ? wrapJob(job) : { id: jobId, name: "", data: {}, attemptsMade: 0, raw: null };
          listener(kozoJob, new Error(failedReason));
        };
        ensureQueueEvents().then((qe) => qe.on("failed", bullListener));
        return () => {
          ensureQueueEvents().then((qe) => qe.off("failed", bullListener));
        };
      }
      return () => {
      };
    },
    async close() {
      await Promise.all([
        worker?.close(),
        queueEvents?.close(),
        queue?.close()
      ]);
    },
    async pause() {
      await worker?.pause();
    },
    async resume() {
      worker?.resume();
    }
  };
  return adapter;
}

// src/adapters/amqp.ts
function createAmqpAdapter(queueName, config) {
  const connUrl = resolveAmqpConnection(config.connection);
  const exchange = config.exchange ?? "";
  const exchangeType = config.exchangeType ?? "direct";
  const durable = config.durable ?? true;
  const prefetch = config.prefetch ?? 1;
  const retryBackoffMs = config.retryBackoffMs ?? 1e3;
  let connection;
  let channel;
  let consumerTag;
  let closed = false;
  const eventListeners = /* @__PURE__ */ new Map();
  let savedHandler;
  let savedConcurrency;
  let channelPromise;
  async function ensureChannel() {
    if (channel && !closed) return channel;
    if (channelPromise) return channelPromise;
    channelPromise = (async () => {
      const amqplib = await import("amqplib").catch((e) => {
        throw new Error(
          "[kozo:queue] amqplib is required for the AMQP adapter. Install it: npm install amqplib",
          { cause: e }
        );
      });
      connection = await amqplib.connect(connUrl);
      connection.on("error", (err) => {
        console.warn(`[kozo:queue] AMQP connection error on "${queueName}":`, err.message);
        channel = void 0;
        channelPromise = void 0;
      });
      connection.on("close", () => {
        if (closed) return;
        console.warn(`[kozo:queue] AMQP connection closed unexpectedly for "${queueName}", will reconnect on next operation`);
        channel = void 0;
        connection = void 0;
        channelPromise = void 0;
        if (savedHandler && consumerTag) {
          consumerTag = void 0;
          setTimeout(() => {
            if (!closed && savedHandler) {
              startConsumer(savedHandler, savedConcurrency).catch((err) => {
                emit("error", err instanceof Error ? err : new Error(String(err)));
              });
            }
          }, retryBackoffMs);
        }
      });
      channel = await connection.createChannel();
      await channel.assertQueue(queueName, { durable });
      if (exchange) {
        await channel.assertExchange(exchange, exchangeType, { durable });
        await channel.bindQueue(queueName, exchange, queueName);
      }
      await channel.prefetch(prefetch);
      channel.on("error", (err) => {
        console.warn(`[kozo:queue] AMQP channel error on "${queueName}":`, err.message);
        channel = void 0;
        channelPromise = void 0;
        if (consumerTag && savedHandler) {
          consumerTag = void 0;
          setTimeout(() => {
            if (!closed && savedHandler) {
              startConsumer(savedHandler, savedConcurrency).catch((reconnErr) => {
                emit("error", reconnErr instanceof Error ? reconnErr : new Error(String(reconnErr)));
              });
            }
          }, retryBackoffMs);
        }
      });
      return channel;
    })();
    try {
      return await channelPromise;
    } catch (err) {
      channelPromise = void 0;
      throw err;
    }
  }
  function emit(event, ...args) {
    const set = eventListeners.get(event);
    if (set) for (const fn of set) fn(...args);
  }
  async function startConsumer(handler, concurrency) {
    const ch = await ensureChannel();
    if (concurrency) await ch.prefetch(concurrency);
    const result = await ch.consume(queueName, async (msg) => {
      if (!msg) return;
      let parsed;
      try {
        parsed = JSON.parse(msg.content.toString());
      } catch {
        ch.nack(msg, false, false);
        return;
      }
      const job = {
        id: parsed.id ?? msg.properties.messageId ?? "",
        name: parsed.name ?? "",
        data: parsed.data,
        attemptsMade: parsed.attemptsMade ?? 0,
        raw: msg
      };
      try {
        await handler(job);
        ch.ack(msg);
        emit("completed", job);
      } catch (err) {
        const maxAttempts = parsed.attempts ?? 3;
        if (job.attemptsMade + 1 < maxAttempts) {
          parsed.attemptsMade = (parsed.attemptsMade ?? 0) + 1;
          const attempt = parsed.attemptsMade;
          const delay = retryBackoffMs * Math.pow(2, attempt - 1);
          setTimeout(async () => {
            try {
              const updated = Buffer.from(JSON.stringify(parsed));
              const retryCh = await ensureChannel();
              retryCh.sendToQueue(queueName, updated, { persistent: durable, messageId: job.id });
              ch.ack(msg);
            } catch (retryErr) {
              ch.nack(msg, false, true);
              emit("error", retryErr instanceof Error ? retryErr : new Error(String(retryErr)));
            }
          }, delay);
        } else {
          ch.nack(msg, false, false);
          emit("failed", job, err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
    consumerTag = result.consumerTag;
  }
  const adapter = {
    name: "amqp",
    queueName,
    async add(jobName, data, options) {
      if (options?.delay) {
        throw new Error(
          `[kozo:queue] The AMQP adapter does not support the "delay" option. Use the Redis adapter for delayed jobs, or implement a dead-letter exchange pattern manually.`
        );
      }
      const ch = await ensureChannel();
      const jobId = options?.jobId ?? crypto.randomUUID();
      const message = Buffer.from(JSON.stringify({
        id: jobId,
        name: jobName,
        data,
        attempts: options?.attempts ?? 3,
        attemptsMade: 0
      }));
      const publishOptions = {
        persistent: durable,
        messageId: jobId,
        headers: { "x-job-name": jobName }
      };
      if (exchange) {
        ch.publish(exchange, queueName, message, publishOptions);
      } else {
        ch.sendToQueue(queueName, message, publishOptions);
      }
      return jobId;
    },
    async process(handler, options) {
      if (consumerTag) throw new Error(`[kozo:queue] Consumer already started for "${queueName}"`);
      savedHandler = handler;
      savedConcurrency = options?.concurrency;
      await startConsumer(handler, options?.concurrency);
    },
    on(event, listener) {
      if (!eventListeners.has(event)) eventListeners.set(event, /* @__PURE__ */ new Set());
      eventListeners.get(event).add(listener);
      return () => {
        eventListeners.get(event)?.delete(listener);
      };
    },
    async close() {
      closed = true;
      if (consumerTag && channel) {
        await channel.cancel(consumerTag).catch(() => {
        });
      }
      await channel?.close().catch(() => {
      });
      await connection?.close().catch(() => {
      });
    }
  };
  return adapter;
}

// src/plugin.ts
function queuePlugin(options = {}) {
  return {
    name: "@kozojs/queue",
    version: "0.3.0",
    install(app) {
      const timeout = options.closeTimeout ?? 5e3;
      const cleanup = async () => {
        const closeTasks = [];
        if (options.adapters) {
          closeTasks.push(...options.adapters.map((a) => a.close()));
        }
        await Promise.race([
          Promise.all(closeTasks),
          new Promise(
            (_, reject) => setTimeout(
              () => reject(new Error("@kozojs/queue: close timeout exceeded")),
              timeout
            )
          )
        ]).catch((err) => {
          console.warn("[kozo:queue]", err.message, "\u2014 forcing close");
        });
      };
      const sm = app.getShutdownManager();
      sm.addCleanupHook(cleanup);
    }
  };
}

// src/index.ts
function createQueue(name, config) {
  switch (config.adapter) {
    case "redis": {
      const { adapter: _, ...rest } = config;
      return createRedisAdapter(name, rest);
    }
    case "amqp": {
      const { adapter: _, ...rest } = config;
      return createAmqpAdapter(name, rest);
    }
    default:
      throw new Error(`[kozo:queue] Unknown adapter: "${config.adapter}"`);
  }
}
export {
  createAmqpAdapter,
  createQueue,
  createRedisAdapter,
  queuePlugin,
  resolveAmqpConnection,
  resolveRedisConnection
};
