// Stub shim — used by wasm-radix.bench.ts as a fallback when the core src path
// cannot be resolved at runtime. Mirrors the minimal WasmRadixRouter API so the
// benchmark gracefully skips the wasm suite (init() returns false).
export class WasmRadixRouter {
  async init(): Promise<boolean> { return false; }
  add(_method: string, _path: string, _id: number): void {}
  find(_method: string, _path: string): { id: number; params: Record<string, string> } | null { return null; }
}
