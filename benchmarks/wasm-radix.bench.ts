// ============================================================================
// WASM Radix Router — Micro-Benchmark
// ============================================================================
//
// Validates the two critical thresholds for the PoC:
//   1. JS ↔ WASM bridge cost  < 200 ns
//   2. Radix trie gain         > 500 ns  (vs RegExp on complex dynamic paths)
//
// Run:  npx tsx benchmarks/wasm-radix.bench.ts
//
// Requires the compiled WASM binary:
//   cd packages/core && bash src/wasm/build.sh
//
// If the .wasm is missing the benchmark prints bridge-cost=N/A and only
// runs the JS RegExp baseline so you can still see the numbers.
// ============================================================================

import { performance } from 'node:perf_hooks';

// ── Helpers ─────────────────────────────────────────────────────────────

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(arr: number[], p: number): number {
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * s.length) - 1;
  return s[Math.max(0, idx)];
}

function stats(label: string, times: number[]) {
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(
    `  ${label.padEnd(40)} avg=${avg.toFixed(0).padStart(6)} ns` +
    `   med=${median(times).toFixed(0).padStart(6)} ns` +
    `   p99=${pct(times, 99).toFixed(0).padStart(6)} ns`,
  );
  return avg;
}

// ── Route table (realistic API surface) ─────────────────────────────────

const ROUTES = [
  // Static
  { method: 'GET',    path: '/health' },
  { method: 'GET',    path: '/api/v1/status' },
  // 1-param
  { method: 'GET',    path: '/api/users/:id' },
  { method: 'PUT',    path: '/api/users/:id' },
  // 2-param
  { method: 'GET',    path: '/api/tenant/:tenantId/users/:userId' },
  // 3-param (the worst case for RegExp)
  { method: 'GET',    path: '/api/tenant/:tenantId/users/:userId/permissions' },
  { method: 'POST',   path: '/api/org/:orgId/team/:teamId/member/:memberId' },
  // Deep static
  { method: 'GET',    path: '/api/v1/admin/settings/security' },
] as const;

// URLs to match (including param values)
const TEST_URLS: Array<{ method: string; url: string; expectMatch: boolean }> = [
  { method: 'GET',  url: '/health',                                        expectMatch: true },
  { method: 'GET',  url: '/api/v1/status',                                 expectMatch: true },
  { method: 'GET',  url: '/api/users/42',                                  expectMatch: true },
  { method: 'PUT',  url: '/api/users/abc-123',                             expectMatch: true },
  { method: 'GET',  url: '/api/tenant/t-99/users/u-7',                     expectMatch: true },
  { method: 'GET',  url: '/api/tenant/t-99/users/u-7/permissions',         expectMatch: true },
  { method: 'POST', url: '/api/org/o1/team/t2/member/m3',                  expectMatch: true },
  { method: 'GET',  url: '/api/v1/admin/settings/security',                expectMatch: true },
  { method: 'GET',  url: '/not-found',                                     expectMatch: false },
];

// ── RegExp baseline (same logic as Kozo nativeListen JS fallback) ───────

interface RegExpRoute {
  method: string;
  staticPath?: string;
  regex?: RegExp;
  paramNames: string[];
  id: number;
}

function buildRegExpRouter(): { routes: RegExpRoute[]; staticMap: Map<string, number> } {
  const routes: RegExpRoute[] = [];
  const staticMap = new Map<string, number>();

  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i];
    const paramNames: string[] = [];
    const regexStr = r.path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    if (paramNames.length === 0) {
      staticMap.set(`${r.method}:${r.path}`, i);
      routes.push({ method: r.method, staticPath: r.path, paramNames: [], id: i });
    } else {
      routes.push({
        method: r.method,
        regex: new RegExp(`^${regexStr}$`),
        paramNames,
        id: i,
      });
    }
  }

  return { routes, staticMap };
}

function regexpMatch(
  method: string,
  path: string,
  routes: RegExpRoute[],
  staticMap: Map<string, number>,
): { id: number; params: Record<string, string> } | null {
  // static O(1)
  const sid = staticMap.get(`${method}:${path}`);
  if (sid !== undefined) return { id: sid, params: {} };

  // dynamic linear scan
  for (const route of routes) {
    if (route.method !== method) continue;
    if (!route.regex) continue;
    const m = route.regex.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    for (let i = 0; i < route.paramNames.length; i++) {
      params[route.paramNames[i]] = m[i + 1];
    }
    return { id: route.id, params };
  }

  return null;
}

// ── WASM benchmark ──────────────────────────────────────────────────────

async function benchWasm() {
  // Dynamic import so the benchmark file works even without the WASM binary
  let WasmRadixRouter: any;
  try {
    const mod = await import('../packages/core/src/wasm-router.js');
    WasmRadixRouter = mod.WasmRadixRouter;
  } catch {
    console.log('\n⚠️  Could not import WasmRadixRouter (ts path).');
    console.log('   Trying relative fallback…\n');
    try {
      const mod = await import('./wasm-router-shim.js');
      WasmRadixRouter = mod.WasmRadixRouter;
    } catch {
      return null;
    }
  }

  const router = new WasmRadixRouter();
  const ok = await router.init();
  if (!ok) return null;

  // Register routes
  const dummyHandler = () => {};
  for (const r of ROUTES) {
    router.addRoute(r.method, r.path, dummyHandler);
  }

  return router;
}

// ── Main ────────────────────────────────────────────────────────────────

const WARMUP = 5_000;
const ITERATIONS = 50_000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Kozo WASM Radix Router — Micro-Benchmark');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\n  Routes: ${ROUTES.length}   Test URLs: ${TEST_URLS.length}`);
  console.log(`  Warmup: ${WARMUP}   Iterations: ${ITERATIONS}\n`);

  // ── Build JS baseline ────────────────────────────────────────────────
  const { routes: regexpRoutes, staticMap } = buildRegExpRouter();

  // ── Try WASM router ──────────────────────────────────────────────────
  const wasm = await benchWasm();

  // ── Benchmark each test URL ──────────────────────────────────────────
  for (const test of TEST_URLS) {
    console.log(`\n  ${test.method} ${test.url} ${test.expectMatch ? '' : '(miss)'}`);
    console.log('  ' + '─'.repeat(60));

    // Warmup — JS
    for (let i = 0; i < WARMUP; i++) {
      regexpMatch(test.method, test.url, regexpRoutes, staticMap);
    }

    // Measure — JS
    const jsTimes: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      regexpMatch(test.method, test.url, regexpRoutes, staticMap);
      jsTimes.push((performance.now() - t0) * 1_000_000); // ms → ns
    }
    const jsAvg = stats('JS (Map + RegExp)', jsTimes);

    // Measure — WASM
    if (wasm) {
      // Warmup
      for (let i = 0; i < WARMUP; i++) {
        wasm.match(test.method, test.url);
      }

      const wasmTimes: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        wasm.match(test.method, test.url);
        wasmTimes.push((performance.now() - t0) * 1_000_000);
      }
      const wasmAvg = stats('WASM (Zig radix trie)', wasmTimes);

      const diff = jsAvg - wasmAvg;
      const pctDiff = ((diff / jsAvg) * 100).toFixed(1);
      console.log(
        diff > 0
          ? `  ✅  WASM wins by ${diff.toFixed(0)} ns (${pctDiff}% faster)`
          : `  ❌  JS wins by ${(-diff).toFixed(0)} ns — bridge overhead dominates`,
      );
    } else {
      console.log('  ⬚  WASM (Zig radix trie)              — not available');
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Break-even thresholds:');
  console.log('   Bridge cost target   < 200 ns');
  console.log('   Radix gain target    > 500 ns on 3-param paths');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!wasm) {
    console.log(' 💡 To enable WASM benchmarks:');
    console.log('    cd packages/core && bash src/wasm/build.sh\n');
  }
}

main().catch(console.error);
