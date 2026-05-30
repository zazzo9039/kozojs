import 'reflect-metadata';
import { performance } from 'perf_hooks';
import http from 'http';
import Fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestRequestUserModule } from './fixtures/nestjs-request.fixture';
import { setupKozoRequest } from './fixtures/kozo-request.fixture';

// ===== HTTP Client Helper =====

function httpRequest(options: http.RequestOptions, body?: any): Promise<{ statusCode: number; data: any; time: number }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        const time = performance.now() - start;
        try {
          resolve({ statusCode: res.statusCode!, data: JSON.parse(raw), time });
        } catch {
          resolve({ statusCode: res.statusCode!, data: raw, time });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      const payload = JSON.stringify(body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

function calcStats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return { mean, median, min, max, p95 };
}

function formatMicro(ms: number) {
  return (ms * 1000).toFixed(0) + 'μs';
}

// ===== Main =====

async function main() {
  const ITERATIONS = 100;

  console.log('\n⚡ Request Overhead Benchmark (Legacy — sequential)');
  console.log('='.repeat(60));
  console.log(`Iterations: ${ITERATIONS}\n`);

  // ---- Fastify ----
  console.log('📊 Setting up Fastify...');
  const fastify = Fastify({ logger: false });
  fastify.get('/api/users', async () => []);
  await fastify.listen({ port: 0 });
  const fastifyPort = (fastify.server.address() as any).port;
  const fastifyTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const r = await httpRequest({ hostname: '127.0.0.1', port: fastifyPort, path: '/api/users', method: 'GET' });
    fastifyTimes.push(r.time);
  }
  await fastify.close();

  // ---- NestJS ----
  console.log('📊 Setting up NestJS...');
  const nestApp = await NestFactory.create(NestRequestUserModule, new FastifyAdapter(), { logger: false });
  await nestApp.listen(0);
  const nestPort = (nestApp.getHttpServer().address() as any).port;
  const nestTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const r = await httpRequest({ hostname: '127.0.0.1', port: nestPort, path: '/api/users', method: 'GET' });
    nestTimes.push(r.time);
  }
  await nestApp.close();

  // ---- Kozo ----
  console.log('📊 Setting up Kozo...');
  const { port: kozoPort, server: kozoServer } = await setupKozoRequest();
  const kozoTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const r = await httpRequest({ hostname: '127.0.0.1', port: kozoPort, path: '/api/users', method: 'GET' });
    kozoTimes.push(r.time);
  }
  kozoServer.close();

  // ===== Results =====
  const results = [
    { name: 'Kozo',    stats: calcStats(kozoTimes) },
    { name: 'Fastify', stats: calcStats(fastifyTimes) },
    { name: 'NestJS',  stats: calcStats(nestTimes) },
  ];

  results.sort((a, b) => a.stats.mean - b.stats.mean);

  console.log('\n' + '='.repeat(60));
  console.log('📈 RESULTS — GET /api/users latency');
  console.log('='.repeat(60));
  console.log(
    '\n' +
    'Framework'.padEnd(12) +
    'Mean'.padStart(10) +
    'Median'.padStart(10) +
    'Min'.padStart(10) +
    'Max'.padStart(10) +
    'p95'.padStart(10)
  );
  console.log('-'.repeat(62));
  for (const r of results) {
    const rank = r === results[0] ? ' 🏆' : '';
    console.log(
      (r.name + rank).padEnd(14) +
      formatMicro(r.stats.mean).padStart(10) +
      formatMicro(r.stats.median).padStart(10) +
      formatMicro(r.stats.min).padStart(10) +
      formatMicro(r.stats.max).padStart(10) +
      formatMicro(r.stats.p95).padStart(10)
    );
  }

  const kozoStats = results.find(r => r.name === 'Kozo')!.stats;
  console.log('\n📊 vs Kozo:');
  for (const r of results.filter(r => r.name !== 'Kozo')) {
    const diff = ((r.stats.mean - kozoStats.mean) / r.stats.mean * 100);
    const arrow = diff > 0 ? '🟢' : '🔴';
    console.log(`  ${arrow} ${r.name.padEnd(10)} Kozo is ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'faster' : 'slower'}`);
  }

  console.log('');
}

main().catch(console.error);
