// ============================================
// GRACEFUL SHUTDOWN INFRASTRUCTURE
// ============================================

import type { Server } from 'node:http';

// Local type definitions to avoid cross-package dependency
type DatabaseProvider = 'postgresql' | 'mysql' | 'sqlite';
type DatabaseInstance = Record<string, unknown>;

/**
 * Shutdown configuration options
 */
export interface ShutdownOptions {
  /** Maximum time to wait for in-flight requests to complete (default: 30000ms) */
  timeoutMs?: number;
  /** Callback fired when shutdown starts */
  onShutdownStart?: (inflightCount: number) => void;
  /** Callback fired when all requests complete before timeout */
  onShutdownComplete?: () => void;
  /** Callback fired when shutdown times out */
  onShutdownTimeout?: (remainingInflight: number) => void;
  /** Database instance to close (optional) */
  database?: DatabaseInstance;
  /** Database provider type (required if database is provided) */
  databaseProvider?: DatabaseProvider;
}

/**
 * Internal state for tracking in-flight requests
 */
export interface InflightTracker {
  count: number;
  requests: Set<Promise<unknown>>;
}

/**
 * Create an in-flight request tracker
 */
export function createInflightTracker(): InflightTracker {
  return {
    count: 0,
    requests: new Set(),
  };
}

/**
 * Track a request - call at the start of each request
 */
export function trackRequest(tracker: InflightTracker): () => void {
  tracker.count++;
  let resolvePromise: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  tracker.requests.add(promise);
  
  // Return untrack function to call when request completes
  return () => {
    tracker.count--;
    tracker.requests.delete(promise);
    resolvePromise();
  };
}

/**
 * Shutdown state machine
 */
export type ShutdownState = 'running' | 'shutting-down' | 'shutdown';

/**
 * Graceful shutdown manager
 */
export class ShutdownManager {
  private state: ShutdownState = 'running';
  private abortController: AbortController | null = null;
  private server: Server | null = null;
  private tracker: InflightTracker;
  private database: DatabaseInstance | null = null;
  private databaseProvider: DatabaseProvider | null = null;
  private cleanupHooks: Array<() => Promise<void>> = [];
  private shutdownStartCallbacks: Array<() => void> = [];
  // Drain gate for fast-path (count-only) requests
  private countDrainResolve: (() => void) | null = null;

  constructor() {
    this.tracker = createInflightTracker();
  }

  /**
   * Register a callback to be called when shutdown starts
   */
  onShutdownStart(callback: () => void): void {
    this.shutdownStartCallbacks.push(callback);
  }

  /**
   * Get current shutdown state
   */
  getState(): ShutdownState {
    return this.state;
  }

  /**
   * Check if server is shutting down
   */
  isShuttingDown(): boolean {
    return this.state !== 'running';
  }

  /**
   * Get current in-flight request count
   */
  getInflightCount(): number {
    return this.tracker.count;
  }

  /**
   * Set the server instance for shutdown
   */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Set database for cleanup
   */
  setDatabase(db: DatabaseInstance, provider: DatabaseProvider): void {
    this.database = db;
    this.databaseProvider = provider;
  }

  /**
   * Get the AbortController signal for request cancellation
   */
  getAbortSignal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }

  /**
   * Create a request tracker middleware
   * Returns an untrack function to call when request completes
   * Lazy allocation: only creates Promise when shutting down
   */
  trackRequest(): () => void {
    // Fast path: no Promise allocation during normal operation
    if (this.state === 'running') {
      this.tracker.count++;
      return () => {
        this.tracker.count--;
        // If shutdown is now waiting for this count to reach 0, resolve the gate
        if (this.state !== 'running' && this.tracker.count === 0 && this.countDrainResolve) {
          this.countDrainResolve();
          this.countDrainResolve = null;
        }
      };
    }
    // Slow path: during shutdown, track with Promise for awaitAllInflight()
    return trackRequest(this.tracker);
  }

  /**
   * Register a cleanup callback to run during shutdown (after draining requests, before closing DB).
   * Plugins should use this instead of raw process.on('SIGTERM', ...).
   */
  addCleanupHook(fn: () => Promise<void>): void {
    this.cleanupHooks.push(fn);
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    const {
      timeoutMs = 30000,
      onShutdownStart,
      onShutdownComplete,
      onShutdownTimeout,
    } = options;

    // Handle already-shutdown state
    if (this.state === 'shutdown') {
      console.warn('[Kozo] Shutdown already completed');
      return;
    }

    // Handle in-progress shutdown
    if (this.state === 'shutting-down') {
      console.warn('[Kozo] Shutdown already in progress');
      return;
    }

    this.state = 'shutting-down';

    // Notify registered callbacks (e.g., hot-swap fetch)
    for (const cb of this.shutdownStartCallbacks) cb();

    // Create AbortController to signal all handlers
    this.abortController = new AbortController();
    this.abortController.abort();

    const inflightCount = this.tracker.count;
    onShutdownStart?.(inflightCount);

    if (inflightCount > 0) {
      console.log(`[Kozo] Graceful shutdown: waiting for ${inflightCount} in-flight requests`);
    }

    // Stop accepting new connections
    if (this.server) {
      this.server.close(() => {
        console.log('[Kozo] HTTP server closed');
      });
    }

    // Wait for in-flight requests with timeout
    const drainPromise = this.drainRequests();
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        const remaining = this.tracker.count;
        if (remaining > 0) {
          console.warn(
            `[Kozo] Shutdown timed out after ${timeoutMs}ms with ${remaining} request(s) still in-flight — forcing close`,
          );
        }
        onShutdownTimeout?.(remaining);
        resolve();
      }, timeoutMs);
    });

    await Promise.race([drainPromise, timeoutPromise]);
    clearTimeout(timer!);

    // Run registered cleanup hooks (e.g., queue adapters, cache connections)
    if (this.cleanupHooks.length > 0) {
      await Promise.allSettled(this.cleanupHooks.map((fn) => fn()));
    }

    // Close database connections
    await this.closeDatabase();

    this.state = 'shutdown';
    onShutdownComplete?.();
    console.log('[Kozo] Graceful shutdown complete');
  }

  /**
   * Wait for all in-flight requests to complete.
   * Handles both fast-path (count-only) and slow-path (Promise-tracked) requests.
   */
  private async drainRequests(): Promise<void> {
    // Slow-path requests (started after shutdown began)
    const slowPathDrain =
      this.tracker.requests.size > 0
        ? Promise.all([...this.tracker.requests])
        : Promise.resolve();

    // Fast-path requests (started before shutdown, tracked by count only)
    let fastPathDrain: Promise<void>;
    if (this.tracker.count === 0) {
      fastPathDrain = Promise.resolve();
    } else {
      // Create a gate promise resolved by the last untrack() call
      fastPathDrain = new Promise<void>((resolve) => {
        this.countDrainResolve = resolve;
      });
    }

    await Promise.all([slowPathDrain, fastPathDrain]);
  }

  /**
   * Close database connections based on provider
   */
  private async closeDatabase(): Promise<void> {
    if (!this.database || !this.databaseProvider) {
      return;
    }

    try {
      switch (this.databaseProvider) {
        case 'postgresql': {
          // postgres.js client has end() method
          const client = (this.database as any).$client;
          if (client && typeof client.end === 'function') {
            await client.end();
            console.log('[Kozo] PostgreSQL connection closed');
          }
          break;
        }
        case 'mysql': {
          // mysql2 connection has end() method
          const client = (this.database as any).$client;
          if (client && typeof client.end === 'function') {
            await client.end();
            console.log('[Kozo] MySQL connection closed');
          }
          break;
        }
        case 'sqlite': {
          // better-sqlite3 has close() method (synchronous)
          const client = (this.database as any).$client;
          if (client && typeof client.close === 'function') {
            client.close();
            console.log('[Kozo] SQLite connection closed');
          }
          break;
        }
      }
    } catch (err) {
      console.error('[Kozo] Error closing database connection:', err);
    }
  }
}

/**
 * Create a shutdown manager instance
 */
export function createShutdownManager(): ShutdownManager {
  return new ShutdownManager();
}
