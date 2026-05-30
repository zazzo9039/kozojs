import 'reflect-metadata';
import { performance } from 'perf_hooks';
import Fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestStartupBenchModule } from './fixtures/nestjs-startup.fixture';
import { setupKozoStartup } from './fixtures/kozo-startup.fixture';

// ===== Benchmark Functions =====

async function benchmarkNestJSStartup(iterations: number = 10): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const app = await NestFactory.create(NestStartupBenchModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.listen(0);
    times.push(performance.now() - start);
    await app.close();
  }
  return times;
}

async function benchmarkFastifyStartup(iterations: number = 10): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const fastify = Fastify({ logger: false });
    fastify.get('/bench/hello', async () => ({ message: 'Hello from service' }));
    fastify.get('/bench/simple', async () => ({ message: 'Simple response' }));
    await fastify.listen({ port: 0 });
    times.push(performance.now() - start);
    await fastify.close();
  }
  return times;
}

async function benchmarkKozoStartup(iterations: number = 10): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const { server } = await setupKozoStartup();
    times.push(performance.now() - start);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return times;
}

// ===== Statistics =====

function calcStats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { mean, median, min, max, p95 };
}

function formatMs(n: number) {
  return n.toFixed(2) + 'ms';
}

// ===== Main =====

async function main() {
  const ITERATIONS = 10;

  console.log('\n🚀 Startup Time Benchmark');
  console.log('='.repeat(60));
  console.log(`Iterations: ${ITERATIONS}\n`);

  console.log('\ud83d\udcca Running NestJS...');
  const nestTimes = await benchmarkNestJSStartup(ITERATIONS);

  console.log('\ud83d\udcca Running Fastify...');
  const fastifyTimes = await benchmarkFastifyStartup(ITERATIONS);

  console.log('📊 Running Kozo...');
  const kozoTimes = await benchmarkKozoStartup(ITERATIONS);

  const results = [
    { name: 'NestJS',  stats: calcStats(nestTimes) },
    { name: 'Fastify', stats: calcStats(fastifyTimes) },
    { name: 'Kozo',    stats: calcStats(kozoTimes) },
  ].sort((a, b) => a.stats.mean - b.stats.mean);

  const kozoMean = calcStats(kozoTimes).mean;

  console.log('\n📈 Results (sorted by mean startup time):');
  console.log('-'.repeat(60));
  console.log(
    'Framework'.padEnd(12),
    'Mean'.padEnd(12),
    'Median'.padEnd(12),
    'Min'.padEnd(12),
    'Max'.padEnd(12),
    'P95'.padEnd(12),
    'vs Kozo'
  );
  console.log('-'.repeat(90));

  for (const { name, stats } of results) {
    const ratio = stats.mean / kozoMean;
    const vsKozo = ratio === 1 ? '(baseline)' : `${ratio.toFixed(2)}x`;
    console.log(
      name.padEnd(12),
      formatMs(stats.mean).padEnd(12),
      formatMs(stats.median).padEnd(12),
      formatMs(stats.min).padEnd(12),
      formatMs(stats.max).padEnd(12),
      formatMs(stats.p95).padEnd(12),
      vsKozo
    );
  }

  console.log('\n✅ Benchmark complete.\n');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
