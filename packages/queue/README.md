# @kozojs/queue

Multi-backend job queue integration for [Kozo](https://github.com/zazzo9039/kozojs) framework.  
Supports **Redis** (BullMQ) and **AMQP** (RabbitMQ) through a unified adapter interface.

## Install

```bash
# Redis backend (BullMQ)
npm install @kozojs/queue bullmq

# AMQP backend (RabbitMQ) — optional
npm install @kozojs/queue amqplib
```

## Quick Start

### Unified API — `createQueue`

```typescript
import { createQueue, queuePlugin } from '@kozojs/queue';
import { createKozo } from '@kozojs/core';

type EmailJob = { to: string; subject: string; body: string };

// Redis adapter
const emailQueue = createQueue<EmailJob>('emails', {
  adapter: 'redis',
  connection: process.env.REDIS_URL ?? 'redis://localhost:6379',
});

// — or — AMQP adapter
const taskQueue = createQueue<TaskJob>('tasks', {
  adapter: 'amqp',
  connection: process.env.AMQP_URL ?? 'amqp://localhost',
});
```

`createQueue()` is synchronous; backend connections are opened by the adapter as needed. Run processors in a dedicated worker process when jobs should not share the API process lifecycle.

### Enqueue jobs

```typescript
await emailQueue.add('welcome', { to: 'user@example.com', subject: 'Hello!', body: 'Welcome!' });

// With options
await emailQueue.add('newsletter', data, {
  delay: 60_000,      // delay 60s
  priority: 1,        // lower = higher
  attempts: 5,        // override retry count
  jobId: 'unique-id', // deduplication
});
```

### Process jobs

```typescript
await emailQueue.process(async (job) => {
  console.log(`Processing ${job.name}:`, job.data);
  await sendEmail(job.data.to, job.data.subject, job.data.body);
}, { concurrency: 5 });
```

### Listen to events

```typescript
const unsub = emailQueue.on('completed', (job) => console.log('✅ Done:', job.id));
emailQueue.on('failed', (job, err) => console.error('❌ Failed:', job.id, err.message));

// Unsubscribe when needed
unsub();
```

### Graceful shutdown plugin

```typescript
const app = createKozo({ services: { emailQueue } });

app.use(queuePlugin({
  adapters: [emailQueue, taskQueue],
  closeTimeout: 10_000,
}));
```

## Direct adapter constructors

For advanced use cases, create adapters directly:

```typescript
import { createRedisAdapter, createAmqpAdapter } from '@kozojs/queue';

const redis = createRedisAdapter('emails', {
  connection: 'redis://localhost:6379',
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2_000 } },
});

const amqp = createAmqpAdapter('tasks', {
  connection: 'amqp://localhost',
  exchange: 'kozo.tasks',
  exchangeType: 'topic',
  durable: true,
  prefetch: 10,
});
```

## Adapter Interface

Both adapters implement `QueueAdapter<TData, TResult>`:

| Method | Description |
|---|---|
| `add(name, data, opts?)` | Enqueue a job. Returns job ID |
| `process(handler, opts?)` | Start consuming jobs |
| `on(event, listener)` | Subscribe to events. Returns unsubscribe fn |
| `close()` | Gracefully close all connections |
| `pause?()` | Pause processing (Redis only) |
| `resume?()` | Resume processing (Redis only) |

## Defaults

| Setting | Value |
|---|---|
| Retry attempts | 3 |
| Backoff | Exponential, 1s base |
| Completed retention | 1,000 jobs (Redis) |
| Failed retention | 5,000 jobs (Redis) |
| Queue durable | `true` (AMQP) |
| Prefetch | 1 (AMQP) |

## License

MIT
