import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queuePlugin } from '../../src/plugin.js';

// Mock @kozojs/core
vi.mock('@kozojs/core', () => ({}));

describe('queuePlugin', () => {
  let mockAddCleanupHook: ReturnType<typeof vi.fn>;
  let mockApp: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddCleanupHook = vi.fn();
    mockApp = {
      getShutdownManager: () => ({
        addCleanupHook: mockAddCleanupHook,
      }),
    };
  });

  it('returns plugin with correct name and version', () => {
    const plugin = queuePlugin();
    expect(plugin.name).toBe('@kozojs/queue');
    expect(plugin.version).toBe('0.3.0');
    expect(typeof plugin.install).toBe('function');
  });

  it('install() registers a cleanup hook on ShutdownManager', () => {
    const plugin = queuePlugin();
    plugin.install(mockApp);
    expect(mockAddCleanupHook).toHaveBeenCalledTimes(1);
    expect(typeof mockAddCleanupHook.mock.calls[0][0]).toBe('function');
  });

  it('cleanup hook calls close() on all adapters', async () => {
    const adapter1 = { close: vi.fn().mockResolvedValue(undefined) };
    const adapter2 = { close: vi.fn().mockResolvedValue(undefined) };

    const plugin = queuePlugin({
      adapters: [adapter1 as any, adapter2 as any],
    });
    plugin.install(mockApp);

    const cleanup = mockAddCleanupHook.mock.calls[0][0];
    await cleanup();

    expect(adapter1.close).toHaveBeenCalled();
    expect(adapter2.close).toHaveBeenCalled();
  });

  it('cleanup hook handles timeout and logs warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hangingAdapter = {
      close: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    };

    const plugin = queuePlugin({
      adapters: [hangingAdapter as any],
      closeTimeout: 50, // 50ms timeout for fast test
    });
    plugin.install(mockApp);

    const cleanup = mockAddCleanupHook.mock.calls[0][0];
    await cleanup();

    expect(warnSpy).toHaveBeenCalledWith(
      '[kozo:queue]',
      '@kozojs/queue: close timeout exceeded',
      expect.any(String),
    );
    warnSpy.mockRestore();
  });

  it('empty options does not throw', async () => {
    const plugin = queuePlugin();
    plugin.install(mockApp);

    const cleanup = mockAddCleanupHook.mock.calls[0][0];
    await expect(cleanup()).resolves.toBeUndefined();
  });
});
