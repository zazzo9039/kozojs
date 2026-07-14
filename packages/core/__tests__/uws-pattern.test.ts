// ============================================================================
// expandUwsPatterns — optional-param expansion for the uWS transport
// ============================================================================
//
// Pure unit tests (no uWebSockets.js needed) that lock in how route patterns
// are turned into concrete uWS registrations. uWS has no optional-param
// syntax, so `:id?` must be expanded into the with-segment and without-segment
// forms to match Hono's `listen()` semantics.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { expandUwsPatterns } from '../src/uws-transport.js';

describe('expandUwsPatterns', () => {
  it('leaves a static route untouched (fast path)', () => {
    const names: string[] = [];
    const variants = expandUwsPatterns('/health', names);
    expect(variants).toEqual([{ pattern: '/health', paramNames: [] }]);
    // fast path returns the same reference — no allocation for the common case
    expect(variants[0].paramNames).toBe(names);
  });

  it('leaves a required param untouched (fast path)', () => {
    const names = ['id'];
    const variants = expandUwsPatterns('/users/:id', names);
    expect(variants).toEqual([{ pattern: '/users/:id', paramNames: ['id'] }]);
    expect(variants[0].paramNames).toBe(names);
  });

  it('expands a trailing optional param into two registrations', () => {
    // app.ts extracts the name as `id?` (keeps the `?`); expansion normalizes it
    const variants = expandUwsPatterns('/opt/:id?', ['id?']);
    expect(variants).toEqual([
      { pattern: '/opt/:id', paramNames: ['id'] },
      { pattern: '/opt', paramNames: [] },
    ]);
  });

  it('registers the more specific pattern first', () => {
    const variants = expandUwsPatterns('/opt/:id?', ['id?']);
    expect(variants[0].pattern).toBe('/opt/:id');
    expect(variants[1].pattern).toBe('/opt');
  });

  it('keeps a required param before a trailing optional one', () => {
    const variants = expandUwsPatterns('/u/:uid/posts/:pid?', ['uid', 'pid?']);
    expect(variants).toEqual([
      { pattern: '/u/:uid/posts/:pid', paramNames: ['uid', 'pid'] },
      { pattern: '/u/:uid/posts', paramNames: ['uid'] },
    ]);
  });

  it('expands multiple trailing optional params progressively', () => {
    const variants = expandUwsPatterns('/a/:x?/:y?', ['x?', 'y?']);
    expect(variants).toEqual([
      { pattern: '/a/:x/:y', paramNames: ['x', 'y'] },
      { pattern: '/a/:x', paramNames: ['x'] },
      { pattern: '/a', paramNames: [] },
    ]);
  });

  it('handles an optional param at the root', () => {
    const variants = expandUwsPatterns('/:slug?', ['slug?']);
    expect(variants).toEqual([
      { pattern: '/:slug', paramNames: ['slug'] },
      { pattern: '/', paramNames: [] },
    ]);
  });

  it('normalizes a non-trailing optional name without making it absent-matchable', () => {
    // Only trailing optional segments become truly optional; a mid-path `?`
    // still has its name normalized (`x`, not `x?`) but yields one variant.
    const variants = expandUwsPatterns('/a/:x?/b', ['x?']);
    expect(variants).toEqual([{ pattern: '/a/:x/b', paramNames: ['x'] }]);
  });
});
