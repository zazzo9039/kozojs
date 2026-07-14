import { describe, it, expect } from 'vitest';
import { chunksToUtf8, parseJsonBodyFromChunks } from '../src/body-read.js';

describe('body-read', () => {
  it('chunksToUtf8 returns empty string for no chunks (absent POST body)', () => {
    expect(chunksToUtf8([])).toBe('');
  });

  it('parseJsonBodyFromChunks treats absent body as empty object', () => {
    expect(parseJsonBodyFromChunks([])).toEqual({});
  });

  it('single empty chunk is treated as absent body', () => {
    expect(chunksToUtf8([Buffer.alloc(0)])).toBe('');
    expect(parseJsonBodyFromChunks([Buffer.alloc(0)])).toEqual({});
  });

  it('single non-empty chunk avoids Buffer.concat', () => {
    expect(chunksToUtf8([Buffer.from('{"a":1}')])).toBe('{"a":1}');
    expect(parseJsonBodyFromChunks([Buffer.from('{"a":1}')])).toEqual({ a: 1 });
  });

  it('multiple chunks concatenate correctly', () => {
    const parts = [Buffer.from('{"a":'), Buffer.from('1}')];
    expect(chunksToUtf8(parts)).toBe('{"a":1}');
    expect(parseJsonBodyFromChunks(parts)).toEqual({ a: 1 });
  });
});
