/** Module-scoped decoder — avoid per-request/chunk allocation in hot paths. */
export const UTF8_DECODER = new TextDecoder();

export function chunksToUtf8(chunks: Buffer[]): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return chunks[0]!.toString('utf8');
  return Buffer.concat(chunks).toString('utf8');
}

export function parseJsonBodyFromChunks(chunks: Buffer[]): unknown {
  const str = chunksToUtf8(chunks);
  return str ? JSON.parse(str) : {};
}
