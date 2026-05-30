import 'reflect-metadata';
import { performance } from 'perf_hooks';
import http from 'http';
import Fastify from 'fastify';
import { setupKozoRequest } from './fixtures/kozo-request.fixture';

// ===== HTTP Helper =====

function httpRequest(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/users', method: 'GET' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(performance.now() - start));
    });
    req.on('error', reject);
    req.end();
  });
}

// ===== Statistics =====

function mean(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]) {
  const m = mean(arr);
  return Math.sqrt(arr.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / arr.length);
}

function tTest(a: number[], b: number[]): { t: number; significant: boolean } {
  const meanA = mean(a);
  const meanB = mean(b);
  const varA = stddev(a) ** 2;
  const varB = stddev(b) ** 2;
  const se = Math.sqrt(varA / a.length + varB / b.length);
  const t = Math.abs((meanA - meanB) / se);
  // p < 0.05 threshold: t > 1.96 (two-tailed, large sample)
  return { t, significant: t > 1.96 };
}

function percentile(arr: number[], p: number) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)];
}

// ===== Main =====

async function main() {
  const WARMUP = 50;
  const ITERATIONS = 500;

  console.log('\n📐 Statistical Validation — Kozo vs Fastify');
  console.log('='.repeat(60));
  console.log(`Warmup: ${WARMUP} | Iterations: ${ITERATIONS}\n`);

  // ---- Fastify ----
  console.log('Setting up Fastify...');
  const fastify = Fastify({ logger: false });
  fastify.get('/api/users', async () => []);
  await fastify.listen({ port: 0 });
  const fastifyPort = (fastify.server.address() as any).port;
  for (let i = 0; i < WARMUP; i++) await httpRequest(fastifyPort);
  const fastifyTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) fastifyTimes.push(await httpRequest(fastifyPort));
  await fastify.close();

  // ---- Kozo ----
  console.log('Setting up Kozo...');
  const { port: kozoPort, server: kozoServer } = await setupKozoRequest();
  for (let i = 0; i < WARMUP; i++) await httpRequest(kozoPort);
  const kozoTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) kozoTimes.push(await httpRequest(kozoPort));
  kozoServer.close();

  // ===== Report =====
  const frameworks = [
    { name: 'Kozo',    times: kozoTimes },
    { name: 'Fastify', times: fastifyTimes },
  ];

  frameworks.sort((a, b) => mean(a.times) - mean(b.times));

  console.log('\n' + '='.repeat(60));
  console.log('📈 Statistical Summary (GET /api/users)');
  console.log('='.repeat(60));
  console.log(
    '\n' +
    'Framework'.padEnd(12) +
    'Mean(μs)'.padStart(12) +
    'Stddev'.padStart(10) +
    'p50(μs)'.padStart(10) +
    'p95(μs)'.padStart(10) +
    'p99(μs)'.padStart(10)
  );
  console.log('-'.repeat(64));
  for (const fw of frameworks) {
    const m = mean(fw.times) * 1000;
    const s = stddev(fw.times) * 1000;
    const p50 = percentile(fw.times, 0.5) * 1000;
    const p95 = percentile(fw.times, 0.95) * 1000;
    const p99 = percentile(fw.times, 0.99) * 1000;
    const rank = fw === frameworks[0] ? ' 🏆' : '';
    console.log(
      (fw.name + rank).padEnd(14) +
      m.toFixed(1).padStart(12) +
      s.toFixed(1).padStart(10) +
      p50.toFixed(1).padStart(10) +
      p95.toFixed(1).padStart(10) +
      p99.toFixed(1).padStart(10)
    );
  }

  // ===== T-Tests =====
  console.log('\n📐 Statistical Significance (t-test, p < 0.05):');
  const pairs = [
    ['Kozo', 'Fastify'],
  ];
  for (const [nameA, nameB] of pairs) {
    const a = frameworks.find(f => f.name === nameA)!.times;
    const b = frameworks.find(f => f.name === nameB)!.times;
    const { t, significant } = tTest(a, b);
    const verdict = significant ? '✅ significant' : '⚠️  not significant';
    console.log(`  ${nameA} vs ${nameB}: t=${t.toFixed(3)} → ${verdict}`);
  }

  // ===== Kozo vs others =====
  const kozo = frameworks.find(f => f.name === 'Kozo')!;
  console.log('\n📊 Kozo performance vs others:');
  for (const fw of frameworks.filter(f => f.name !== 'Kozo')) {
    const diff = ((mean(fw.times) - mean(kozo.times)) / mean(fw.times) * 100);
    const arrow = diff > 0 ? '🟢' : '🔴';
    console.log(`  ${arrow} vs ${fw.name.padEnd(10)} Kozo is ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'faster' : 'slower'} (mean)`);
  }

  console.log('');
}

main().catch(console.error);
