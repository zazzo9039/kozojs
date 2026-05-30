// ============================================================================
// Tests for shutdown.ts — ShutdownManager, trackRequest fast path
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShutdownManager, createInflightTracker, trackRequest } from '../src/shutdown.js';

// ── createInflightTracker ───────────────────────────────────────────────

describe('createInflightTracker', () => {
  it('starts at zero', () => {
    const tracker = createInflightTracker();
    expect(tracker.count).toBe(0);
    expect(tracker.requests.size).toBe(0);
  });
});

// ── trackRequest (slow-path / Promise-tracked) ──────────────────────────

describe('trackRequest (global)', () => {
  it('increments count and returns untrack function', () => {
    const tracker = createInflightTracker();
    const untrack = trackRequest(tracker);
    expect(tracker.count).toBe(1);
    expect(tracker.requests.size).toBe(1);
    untrack();
    expect(tracker.count).toBe(0);
    expect(tracker.requests.size).toBe(0);
  });

  it('tracks multiple concurrent requests', () => {
    const tracker = createInflightTracker();
    const u1 = trackRequest(tracker);
    const u2 = trackRequest(tracker);
    const u3 = trackRequest(tracker);
    expect(tracker.count).toBe(3);
    u2();
    expect(tracker.count).toBe(2);
    u1();
    u3();
    expect(tracker.count).toBe(0);
  });
});

// ── ShutdownManager ─────────────────────────────────────────────────────

describe('ShutdownManager', () => {
  let manager: ShutdownManager;

  beforeEach(() => {
    manager = new ShutdownManager();
  });

  it('starts in "running" state', () => {
    expect(manager.getState()).toBe('running');
    expect(manager.isShuttingDown()).toBe(false);
  });

  it('getInflightCount returns zero initially', () => {
    expect(manager.getInflightCount()).toBe(0);
  });

  // ── trackRequest fast path ─────────────────────────────────────

  describe('trackRequest fast path', () => {
    it('increments count without Promise allocation in running state', () => {
      const untrack = manager.trackRequest();
      expect(manager.getInflightCount()).toBe(1);
      untrack();
      expect(manager.getInflightCount()).toBe(0);
    });

    it('handles multiple fast-path requests', () => {
      const u1 = manager.trackRequest();
      const u2 = manager.trackRequest();
      expect(manager.getInflightCount()).toBe(2);
      u1();
      expect(manager.getInflightCount()).toBe(1);
      u2();
      expect(manager.getInflightCount()).toBe(0);
    });
  });

  // ── onShutdownStart ────────────────────────────────────────────

  describe('onShutdownStart', () => {
    it('fires callbacks when shutdown begins', async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      manager.onShutdownStart(cb1);
      manager.onShutdownStart(cb2);

      // Suppress console.warn from shutdown
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await manager.shutdown({ timeoutMs: 100 });

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
    });
  });

  // ── shutdown state transitions ─────────────────────────────────

  describe('shutdown lifecycle', () => {
    it('transitions to shutting-down then shutdown', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(manager.getState()).toBe('running');
      await manager.shutdown({ timeoutMs: 100 });
      expect(manager.getState()).toBe('shutdown');
      expect(manager.isShuttingDown()).toBe(true);
    });

    it('calls onShutdownStart callback with inflight count', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const onStart = vi.fn();
      const untrack = manager.trackRequest();
      await manager.shutdown({ timeoutMs: 100, onShutdownStart: onStart });
      expect(onStart).toHaveBeenCalledWith(1);
      untrack();
    });

    it('is idempotent — second shutdown is no-op', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      await manager.shutdown({ timeoutMs: 100 });
      // Second call should warn but not throw
      await manager.shutdown({ timeoutMs: 100 });
      expect(manager.getState()).toBe('shutdown');
    });
  });

  // ── addCleanupHook ─────────────────────────────────────────────

  describe('addCleanupHook', () => {
    it('runs cleanup hooks during shutdown', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const hook = vi.fn(async () => {});
      manager.addCleanupHook(hook);
      await manager.shutdown({ timeoutMs: 100 });
      expect(hook).toHaveBeenCalledOnce();
    });
  });

  // ── hard timeout ───────────────────────────────────────────────

  describe('hard timeout', () => {
    it('forces shutdown after timeout when a handler never completes', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Start a request and intentionally never call untrack (hung handler)
      const untrack = manager.trackRequest();
      expect(manager.getInflightCount()).toBe(1);

      const onTimeout = vi.fn();
      const start = Date.now();
      await manager.shutdown({ timeoutMs: 50, onShutdownTimeout: onTimeout });
      const elapsed = Date.now() - start;

      // Shutdown completed despite hung handler
      expect(manager.getState()).toBe('shutdown');
      // Completed around the timeout, not instantly
      expect(elapsed).toBeGreaterThanOrEqual(45);
      // Callback and warning were fired with remaining count
      expect(onTimeout).toHaveBeenCalledWith(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutdown timed out'),
      );

      untrack(); // cleanup
    });

    it('completes without timeout if all requests finish in time', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const untrack = manager.trackRequest();
      // Complete the request after a short delay
      setTimeout(untrack, 20);

      const onTimeout = vi.fn();
      await manager.shutdown({ timeoutMs: 500, onShutdownTimeout: onTimeout });

      expect(manager.getState()).toBe('shutdown');
      expect(onTimeout).not.toHaveBeenCalled();
    });
  });
});
