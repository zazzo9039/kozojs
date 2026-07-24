/**
 * H4 / F-11 — the response-serializer fallback is no longer silent.
 *
 * Under fast-json-stringify the response schema is a whitelist: fields not
 * declared are omitted (the module doc calls this "intentional contract
 * enforcement"). When z.toJSONSchema / fjs cannot compile the schema
 * (`.transform()`, `z.date()`, custom types) the serializer falls back to
 * unfiltered JSON.stringify — and every undeclared field (passwordHash, tokens,
 * internal flags) is then sent verbatim. That fallback used to be silent.
 *
 * Now:
 *   - the compiled serializer carries `unsafeFallback` when it happened
 *     involuntarily (absent for a deliberate `z.any()`);
 *   - `SchemaCompiler.compile` warns in development and throws in production,
 *     unless `dangerouslyAllowUnenforcedResponse` opts in.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { compileResponseSerializerWithMeta } from '../src/response-serializer.js';
import { SchemaCompiler } from '../src/compiler.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────────────────────────────────────
// The leak this closes: an involuntary fallback stops enforcing the contract.
// ─────────────────────────────────────────────────────────────────────────────

describe('unsafeFallback flags the involuntary fallback (F-11)', () => {
  it('is set when the schema cannot be compiled (.transform)', () => {
    const meta = compileResponseSerializerWithMeta({
      200: z.object({ id: z.string() }).transform((d) => ({ ...d, extra: 1 })),
    })!;
    expect(meta.mode).toBe('json-stringify');
    expect(meta.unsafeFallback).toBeDefined();
    expect(typeof meta.unsafeFallback!.reason).toBe('string');
  });

  it('is set for z.date() in a response schema', () => {
    const meta = compileResponseSerializerWithMeta({ 200: z.object({ created: z.date() }) })!;
    expect(meta.unsafeFallback).toBeDefined();
  });

  it('is ABSENT for a deliberate z.any() response (author opted out, not a failure)', () => {
    const meta = compileResponseSerializerWithMeta({ 200: z.any() })!;
    expect(meta.mode).toBe('json-stringify');
    expect(meta.unsafeFallback).toBeUndefined();
  });

  it('is absent for a compilable schema (fast-json-stringify enforces it)', () => {
    const meta = compileResponseSerializerWithMeta({ 200: z.object({ id: z.string() }) })!;
    expect(meta.mode).toBe('fast-json-stringify');
    expect(meta.unsafeFallback).toBeUndefined();
  });

  it('demonstrates the leak: the fallback serializer keeps an undeclared passwordHash', () => {
    const meta = compileResponseSerializerWithMeta({
      200: z.object({ id: z.string() }).transform((d) => d),
    })!;
    // The schema declares only `id`, but the fallback ships everything.
    const out = JSON.parse(meta.serialize({ id: 'u1', passwordHash: 'LEAKED' }));
    expect(out.passwordHash).toBe('LEAKED');
    // Contrast: an enforcing serializer drops it.
    const enforced = compileResponseSerializerWithMeta({ 200: z.object({ id: z.string() }) })!;
    expect(JSON.parse(enforced.serialize({ id: 'u1', passwordHash: 'LEAKED' })).passwordHash).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SchemaCompiler policy: warn in dev, throw in prod, opt-out downgrades.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_SCHEMA = { response: { 200: z.object({ id: z.string() }).transform((d) => d) } };

describe('SchemaCompiler.compile — fallback is loud', () => {
  it('development: warns once and still returns a serializer', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const compiled = SchemaCompiler.compile(FALLBACK_SCHEMA, { route: 'GET /leaky' });
    expect(compiled.serialize).toBeTypeOf('function');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('GET /leaky');
    expect(warn.mock.calls[0][0]).toContain('WITHOUT field filtering');
  });

  it('production: throws at compile time, naming the route', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => SchemaCompiler.compile(FALLBACK_SCHEMA, { route: 'GET /leaky' })).toThrow(/GET \/leaky/);
  });

  it('production + dangerouslyAllowUnenforcedResponse: warns instead of throwing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      SchemaCompiler.compile(FALLBACK_SCHEMA, { route: 'GET /leaky', dangerouslyAllowUnenforcedResponse: true }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('production: a deliberate z.any() response neither warns nor throws', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => SchemaCompiler.compile({ response: { 200: z.any() } })).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('production: a compilable response schema is unaffected', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => SchemaCompiler.compile({ response: { 200: z.object({ id: z.string() }) } })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End to end: registering a leaky route refuses to boot in production.
// ─────────────────────────────────────────────────────────────────────────────

describe('app registration honors the policy (end to end)', () => {
  it('production: createKozo + a leaky response route throws at registration', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createKozo } = await import('../src/app.js');
    const app = createKozo({ logger: false });
    expect(() =>
      app.get('/leaky', { response: { 200: z.object({ id: z.string() }).transform((d) => d) } }, () => ({ id: '1' })),
    ).toThrow(/could not be compiled/);
  });

  it('production + dangerouslyAllowUnenforcedResponse: the same route registers', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createKozo } = await import('../src/app.js');
    const app = createKozo({ logger: false, dangerouslyAllowUnenforcedResponse: true });
    expect(() =>
      app.get('/leaky', { response: { 200: z.object({ id: z.string() }).transform((d) => d) } }, () => ({ id: '1' })),
    ).not.toThrow();
  });
});
