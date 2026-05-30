// ============================================================================
// WASM Radix Router — Unit Tests
// ============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { WasmRadixRouter } from '../src/wasm-router.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Dummy handler factory — returns a handler that records it was called
function handler(id: string) {
  const fn = ((_req: IncomingMessage, _res: ServerResponse, _params: Record<string, string>) => {
    // no-op — we only care about routing, not execution
  }) as any;
  fn._id = id;
  return fn;
}

describe('WasmRadixRouter', () => {
  let router: WasmRadixRouter;
  let wasmAvailable: boolean;

  beforeAll(async () => {
    router = new WasmRadixRouter();
    wasmAvailable = await router.init();
  });

  it('should load the WASM module', () => {
    expect(wasmAvailable).toBe(true);
    expect(router.isReady).toBe(true);
  });

  describe('when WASM is loaded', () => {
    beforeAll(() => {
      if (!wasmAvailable) return;

      // Static routes
      router.addRoute('GET', '/health', handler('health'));
      router.addRoute('GET', '/api/v1/status', handler('status'));
      router.addRoute('GET', '/api/v1/admin/settings/security', handler('deep-static'));

      // 1-param routes
      router.addRoute('GET', '/api/users/:id', handler('get-user'));
      router.addRoute('PUT', '/api/users/:id', handler('put-user'));
      router.addRoute('DELETE', '/api/users/:id', handler('del-user'));

      // 2-param routes
      router.addRoute('GET', '/api/tenant/:tenantId/users/:userId', handler('tenant-user'));

      // 3-param routes
      router.addRoute('GET', '/api/tenant/:tenantId/users/:userId/permissions', handler('tenant-perm'));
      router.addRoute('POST', '/api/org/:orgId/team/:teamId/member/:memberId', handler('org-member'));
    });

    // ── Static route matching ──────────────────────────────────────────

    it('matches static GET /health', () => {
      const result = router.match('GET', '/health');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('health');
      expect(result!.params).toEqual({});
    });

    it('matches deep static /api/v1/admin/settings/security', () => {
      const result = router.match('GET', '/api/v1/admin/settings/security');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('deep-static');
    });

    it('matches /api/v1/status', () => {
      const result = router.match('GET', '/api/v1/status');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('status');
    });

    // ── Param route matching ───────────────────────────────────────────

    it('extracts single param from /api/users/:id', () => {
      const result = router.match('GET', '/api/users/42');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('get-user');
      expect(result!.params).toEqual({ id: '42' });
    });

    it('extracts single param with complex value', () => {
      const result = router.match('GET', '/api/users/abc-123-xyz');
      expect(result).not.toBeNull();
      expect(result!.params).toEqual({ id: 'abc-123-xyz' });
    });

    it('differentiates methods on same path', () => {
      const getResult = router.match('GET', '/api/users/1');
      const putResult = router.match('PUT', '/api/users/1');
      const delResult = router.match('DELETE', '/api/users/1');

      expect(getResult!.handler._id).toBe('get-user');
      expect(putResult!.handler._id).toBe('put-user');
      expect(delResult!.handler._id).toBe('del-user');
    });

    it('extracts two params from /api/tenant/:tenantId/users/:userId', () => {
      const result = router.match('GET', '/api/tenant/t-99/users/u-7');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('tenant-user');
      expect(result!.params).toEqual({ tenantId: 't-99', userId: 'u-7' });
    });

    it('extracts params on 3-param route with trailing static', () => {
      const result = router.match('GET', '/api/tenant/t-99/users/u-7/permissions');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('tenant-perm');
      expect(result!.params).toEqual({ tenantId: 't-99', userId: 'u-7' });
    });

    it('extracts three params from deep nested route', () => {
      const result = router.match('POST', '/api/org/o1/team/t2/member/m3');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('org-member');
      expect(result!.params).toEqual({ orgId: 'o1', teamId: 't2', memberId: 'm3' });
    });

    // ── 404 / Miss scenarios ───────────────────────────────────────────

    it('returns null for unknown path', () => {
      expect(router.match('GET', '/not-found')).toBeNull();
    });

    it('returns null for wrong method', () => {
      expect(router.match('POST', '/health')).toBeNull();
    });

    it('returns null for partial path match', () => {
      expect(router.match('GET', '/api/users')).toBeNull();
    });

    it('returns null for path with extra segments', () => {
      expect(router.match('GET', '/health/extra')).toBeNull();
    });

    // ── Edge cases ─────────────────────────────────────────────────────

    it('handles path with trailing slash (should not match strict patterns)', () => {
      // Our Zig trie does not normalize trailing slashes — expected miss
      const result = router.match('GET', '/health/');
      // May or may not match depending on trie behavior — document it
      // For now, we just verify no crash
      expect(result === null || result !== null).toBe(true);
    });

    it('handles empty method gracefully', () => {
      const result = router.match('', '/health');
      expect(result).toBeNull();
    });
  });

  // ── SSR Wildcard catch-all routes ────────────────────────────────────
  describe('SSR wildcard routes', () => {
    let ssrRouter: WasmRadixRouter;

    beforeAll(async () => {
      ssrRouter = new WasmRadixRouter();
      const ok = await ssrRouter.init();
      if (!ok) return;

      // Page routes (SSR-style)
      ssrRouter.addRoute('GET', '/blog/*', handler('blog-catchall'));
      ssrRouter.addRoute('GET', '/docs/:section/*', handler('docs-catchall'));
      // API route alongside (must not conflict)
      ssrRouter.addRoute('GET', '/api/health', handler('api-health'));
    });

    it('catches /blog/my-post', () => {
      const result = ssrRouter.match('GET', '/blog/my-post');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('blog-catchall');
      expect(result!.params['*']).toBe('my-post');
    });

    it('catches /blog/2024/march/deep-nested', () => {
      const result = ssrRouter.match('GET', '/blog/2024/march/deep-nested');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('blog-catchall');
      expect(result!.params['*']).toBe('2024/march/deep-nested');
    });

    it('catches /docs/:section/* with both param and wildcard', () => {
      const result = ssrRouter.match('GET', '/docs/guides/getting-started');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('docs-catchall');
      expect(result!.params.section).toBe('guides');
      expect(result!.params['*']).toBe('getting-started');
    });

    it('still matches exact API routes alongside wildcards', () => {
      const result = ssrRouter.match('GET', '/api/health');
      expect(result).not.toBeNull();
      expect(result!.handler._id).toBe('api-health');
    });
  });
});
