# Graceful Shutdown

Kozo provides built-in graceful shutdown that drains in-flight requests before closing.

## Basic Usage

```typescript
const app = createKozo({
  services: { db },
  onStop: async ({ services }) => {
    await services.db.close();
    console.log('Database closed');
  },
});

await app.loadRoutes();
await app.listen(3000);

// Shutdown is automatically triggered on SIGTERM/SIGINT
// Or manually:
await app.shutdown();
```

## Shutdown Lifecycle

```
1. Stop accepting new requests  ← new requests get 503
2. Drain in-flight requests     ← wait for active requests to complete
3. Cleanup hooks                ← plugins, cache connections, etc.
4. Database cleanup             ← if registered via ShutdownManager
5. onStop() lifecycle hook      ← cleanup services, flush queues
6. Close HTTP server            ← release the port
```

## Configuration

```typescript
await app.shutdown({
  // Maximum time to wait for in-flight requests (default: 30000ms)
  timeout: 15_000,

  // Force close after timeout even if requests are still pending
  forceClose: true,
});
```

## Database Cleanup

Register database connections for automatic cleanup:

```typescript
const manager = app.getShutdownManager();
manager.setDatabase(db, 'drizzle');
```

The shutdown manager knows how to close connections for supported providers.

## Behavior During Shutdown

Requests received after shutdown starts:

```json
{
  "type": "about:blank",
  "title": "Service Unavailable",
  "status": 503,
  "detail": "Server is shutting down, please retry later"
}
```

In-flight requests continue until completion or timeout.

## Docker / Kubernetes

Kozo handles `SIGTERM` automatically. For Kubernetes:

```yaml
# pod spec
terminationGracePeriodSeconds: 30
lifecycle:
  preStop:
    exec:
      command: ["/bin/sh", "-c", "sleep 5"]  # Allow LB to deregister
```

```typescript
// Match the grace period
await app.shutdown({ timeout: 25_000 });
```

## onStart / onStop Lifecycle Hooks

```typescript
const app = createKozo({
  services: { db, redis, queue },

  onStart: async ({ services }) => {
    // Run after the server starts listening
    await services.db.migrate();
    await services.redis.ping();
    await services.queue.connect();
    console.log('All services initialized');
  },

  onStop: async ({ services }) => {
    // Run after all requests have drained and internal cleanup is done
    await services.queue.close();
    await services.redis.quit();
    await services.db.close();
    console.log('All services cleaned up');
  },
});
```

`onStop` errors are caught and logged — they do not prevent the server from shutting down.
