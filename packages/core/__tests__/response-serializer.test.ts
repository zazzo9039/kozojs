// ============================================================================
// Tests for response-serializer.ts — fallback triggers, parity, eager compile
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  compileResponseSerializerWithMeta,
  legacyJsonBody,
  toJsonBody,
} from '../src/response-serializer.js';
import { SchemaCompiler } from '../src/compiler.js';

describe('response serializer fallback triggers', () => {
  it('uses json-stringify for z.any() response schema', () => {
    const { mode, serialize } = compileResponseSerializerWithMeta(
      { 200: z.any() },
    )!;
    expect(mode).toBe('json-stringify');
    const date = new Date('2025-01-01T00:00:00.000Z');
    expect(JSON.parse(serialize!({ created: date }))).toEqual({
      created: '2025-01-01T00:00:00.000Z',
    });
  });

  it('falls back to json-stringify when response schema has .transform() (z.toJSONSchema throws)', () => {
    const { mode, serialize } = compileResponseSerializerWithMeta({
      200: z.object({ id: z.string() }).transform((d) => ({ ...d, extra: 1 })),
    })!;
    expect(mode).toBe('json-stringify');
    // Handler output includes undeclared fields — must not be stripped by a wrong fjs compile
    expect(serialize!({ id: 'a', extra: 1 })).toBe('{"id":"a","extra":1}');
  });

  it('falls back to json-stringify for z.date() in response schema', () => {
    const { mode, serialize } = compileResponseSerializerWithMeta({
      200: z.object({ created: z.date() }),
    })!;
    expect(mode).toBe('json-stringify');
    const date = new Date('2025-06-01T12:00:00.000Z');
    expect(serialize!({ created: date })).toBe(
      legacyJsonBody({ created: date }),
    );
  });

  it('uses fast-json-stringify for plain object schemas', () => {
    const { mode } = compileResponseSerializerWithMeta({
      200: z.object({ ok: z.boolean(), count: z.number() }),
    })!;
    expect(mode).toBe('fast-json-stringify');
  });
});

describe('response serializer contract enforcement (fjs vs legacy)', () => {
  it('fjs omits properties not declared in schema — intentional contract enforcement', () => {
    const { mode, serialize } = compileResponseSerializerWithMeta({
      200: z.object({ id: z.string() }),
    })!;
    expect(mode).toBe('fast-json-stringify');

    const data = { id: '1', surpriseFromDb: 'kept-by-json-stringify-only' };
    expect(serialize!(data)).toBe('{"id":"1"}');
    expect(legacyJsonBody(data)).toBe(
      '{"id":"1","surpriseFromDb":"kept-by-json-stringify-only"}',
    );
  });

  it('declared optional properties are retained by fjs', () => {
    const { serialize } = compileResponseSerializerWithMeta({
      200: z.object({ id: z.string(), name: z.string().optional() }),
    })!;
    expect(serialize!({ id: 'a', name: 'n' })).toBe('{"id":"a","name":"n"}');
  });
});

describe('response serializer golden parity (fjs-eligible schemas)', () => {
  const cases: Array<{ label: string; schema: z.ZodType; data: unknown }> = [
    {
      label: 'boolean + number object',
      schema: z.object({ ok: z.boolean(), count: z.number() }),
      data: { ok: true, count: 42 },
    },
    {
      label: 'nested object',
      schema: z.object({ user: z.object({ id: z.string(), active: z.boolean() }) }),
      data: { user: { id: 'u1', active: true } },
    },
    {
      label: 'string array',
      schema: z.object({ tags: z.array(z.string()) }),
      data: { tags: ['a', 'b'] },
    },
    {
      label: 'nullable string',
      schema: z.object({ note: z.string().nullable() }),
      data: { note: null },
    },
  ];

  for (const { label, schema, data } of cases) {
    it(`fjs output matches legacy for ${label} when data conforms to schema`, () => {
      const { mode, serialize } = compileResponseSerializerWithMeta({ 200: schema })!;
      expect(mode).toBe('fast-json-stringify');
      expect(serialize!(data)).toBe(legacyJsonBody(data));
    });
  }
});

describe('eager compile at route registration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fast-json-stringify build during SchemaCompiler.compile, not on first serialize', async () => {
    const buildMock = vi.fn((schema: unknown) => {
      void schema;
      return (data: unknown) => JSON.stringify(data);
    });
    vi.doMock('fast-json-stringify', () => ({ default: buildMock }));

    const { SchemaCompiler: Compiler } = await import('../src/compiler.js');
    expect(buildMock).not.toHaveBeenCalled();

    Compiler.compile({ response: { 200: z.object({ ok: z.boolean() }) } });
    expect(buildMock).toHaveBeenCalledTimes(1);

    const compiled = Compiler.compile({
      response: { 200: z.object({ name: z.string() }) },
    });
    expect(buildMock).toHaveBeenCalledTimes(2);
    compiled.serialize!({ name: 'x' });
    expect(buildMock).toHaveBeenCalledTimes(2);
  });

  it('each route registration produces an independent compiled serializer', () => {
    const a = compileResponseSerializerWithMeta({ 200: z.object({ a: z.number() }) })!;
    const b = compileResponseSerializerWithMeta({ 200: z.object({ b: z.number() }) })!;
    expect(a.serialize).not.toBe(b.serialize);
    expect(a.serialize!({ a: 1 })).toBe('{"a":1}');
    expect(b.serialize!({ b: 2 })).toBe('{"b":2}');
  });
});

describe('SchemaCompiler integration', () => {
  it('serializer converts Date via legacy path when schema uses z.any()', () => {
    const compiled = SchemaCompiler.compile({ response: { 200: z.any() } });
    const date = new Date('2025-01-01T00:00:00.000Z');
    expect(JSON.parse(compiled.serialize!({ created: date }))).toEqual({
      created: '2025-01-01T00:00:00.000Z',
    });
  });
});
