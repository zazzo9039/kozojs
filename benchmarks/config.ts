/**
 * Shared autocannon presets — keep in sync with kozo-native-api/benchmarks/run.ts
 * and kozo/benchmarks/METHODOLOGY.md.
 */
export interface BenchConfig {
  connections: number;
  duration: number;
  pipelining: number;
}

/** Official published comparison (RESULTS.md, docs site). */
export const BENCH_CONFIG_DOCS: BenchConfig = {
  connections: 10,
  duration: 10,
  pipelining: 1,
};

export const BENCH_CONFIGS = {
  /** Official: 10 conn · 10s · pipelining 1 — use for docs / framework comparison */
  docs: BENCH_CONFIG_DOCS,
  /** Quick smoke: 10 conn · 5s */
  light: { connections: 10, duration: 5, pipelining: 1 },
  /** Sustained load without pipelining: 50 conn · 10s */
  medium: { connections: 50, duration: 10, pipelining: 1 },
  /** Stress: 50 conn · 15s · pipelining 5 (GET only; POST/DB use pipelining 1 in app benches) */
  heavy: { connections: 50, duration: 15, pipelining: 5 },
} as const satisfies Record<string, BenchConfig>;

export type BenchConfigName = keyof typeof BENCH_CONFIGS;

export function resolveBenchConfig(name?: string): BenchConfig {
  const key = (name ?? 'docs') as BenchConfigName;
  return BENCH_CONFIGS[key] ?? BENCH_CONFIGS.docs;
}
