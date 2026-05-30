import 'reflect-metadata';
import { performance } from 'perf_hooks';
import http from 'http';
import Fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestRequestUserModule } from './fixtures/nestjs-request.fixture';
import { setupKozoRequest } from './fixtures/kozo-request.fixture';

// ===== Config =====

const ITERATIONS = 200;
const WARMUP = 20;

// ===== HTTP Client Helper =====

function httpRequest(
  options: http.RequestOptions,
  body?: any
): Promise<{ statusCode: number; data: any; time: number }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
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

// ===== Stats =====

function calcStats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { mean, median, min, max, p95, p99 };
}

function formatMicro(ms: number) {
  return (ms * 1000).toFixed(0) + 'μs';
}

// ===== Benchmark Runner =====

async function runRequests(port: number, iterations: number) {
  const getTimes: number[] = [];
  const postTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const get = await httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/users',
      method: 'GET',
    });
    getTimes.push(get.time);

    const post = await httpRequest(
      { hostname: '127.0.0.1', port, path: '/api/users', method: 'POST' },
      { name: `User ${i}`, email: `user${i}@test.com` }
    );
    postTimes.push(post.time);
  }

  return { getTimes, postTimes };
}

// ===== Main =====

async function main() {
  console.log('\n⚡ Request Overhead Benchmark (Fair)');
  console.log('='.repeat(60));
  console.log(`Iterations: ${ITERATIONS} | Warmup: ${WARMUP}`);

  const results: Array<{
    name: string;
    get: ReturnType<typeof calcStats>;
    post: ReturnType<typeof calcStats>;
  }> = [];

  // ---- Fastify ----
  console.log('\n📊 Setting up Fastify...');
  const fastify = Fastify({ logger: false });
  const users: any[] = [];
  fastify.get('/api/users', async () => users);
  fastify.get('/api/users/:id', async (req: any) => {
    return users.find((u) => u.id === req.params.id) ?? { error: 'Not found' };
  });
  fastify.post('/api/users', async (req: any, reply: any) => {
    const user = { id: String(users.length + 1), ...(req.body as any) };
    users.push(user);
    reply.code(201);
    return user;
  });
  await fastify.listen({ port: 0, host: '127.0.0.1' });
  const fastifyPort = (fastify.server.address() as any).port;
  console.log(`   Fastify listening on port ${fastifyPort}`);
  console.log('   Warming up Fastify...');
  await runRequests(fastifyPort, WARMUP);
  console.log('   Running Fastify...');
  const fastifyResult = await runRequests(fastifyPort, ITERATIONS);
  await fastify.close();
  results.push({
    name: 'Fastify',
    get: calcStats(fastifyResult.getTimes),
    post: calcStats(fastifyResult.postTimes),
  });

  // ---- NestJS ----
  console.log('\n📊 Setting up NestJS...');
  const nestApp = await NestFactory.create(NestRequestUserModule, new FastifyAdapter(), {
    logger: false,
  });
  await nestApp.init();
  await nestApp.getHttpAdapter().getInstance().listen({ port: 0, host: '127.0.0.1' });
  const nestPort = (nestApp.getHttpServer().address() as any).port;
  console.log(`   NestJS listening on port ${nestPort}`);
  console.log('   Warming up NestJS...');
  await runRequests(nestPort, WARMUP);
  console.log('   Running NestJS...');
  const nestResult = await runRequests(nestPort, ITERATIONS);
  await nestApp.close();
  results.push({
    name: 'NestJS',
    get: calcStats(nestResult.getTimes),
    post: calcStats(nestResult.postTimes),
  });

  // ---- Kozo ----
  console.log('\n📊 Setting up Kozo...');
  const { port: kozoPort, server: kozoServer } = await setupKozoRequest();
  console.log(`   Kozo listening on port ${kozoPort}`);
  console.log('   Warming up Kozo...');
  await runRequests(kozoPort, WARMUP);
  console.log('   Running Kozo...');
  const kozoResult = await runRequests(kozoPort, ITERATIONS);
  kozoServer.close();
  results.push({
    name: 'Kozo',
    get: calcStats(kozoResult.getTimes),
    post: calcStats(kozoResult.postTimes),
  });

  // ===== Print Results =====

  const kozo = results.find((r) => r.name === 'Kozo')!;
  const sorted = [...results].sort((a, b) => a.get.mean - b.get.mean);

  console.log('\n📈 GET /api/users — Results (sorted by mean):');
  console.log('-'.repeat(80));
  console.log(
    'Framework'.padEnd(12) +
      'Mean'.padEnd(10) +
      'Median'.padEnd(10) +
      'P95'.padEnd(10) +
      'P99'.padEnd(10) +
      'Min'.padEnd(10) +
      'vs Kozo'
  );
  console.log('-'.repeat(80));
  for (const r of sorted) {
    const ratio = r.get.mean / kozo.get.mean;
    const vs = r.name === 'Kozo' ? '(baseline)' : `${ratio.toFixed(2)}x`;
    console.log(
      r.name.padEnd(12) +
        formatMicro(r.get.mean).padEnd(10) +
        formatMicro(r.get.median).padEnd(10) +
        formatMicro(r.get.p95).padEnd(10) +
        formatMicro(r.get.p99).padEnd(10) +
        formatMicro(r.get.min).padEnd(10) +
        vs
    );
  }

  const sortedPost = [...results].sort((a, b) => a.post.mean - b.post.mean);

  console.log('\n📈 POST /api/users — Results (sorted by mean):');
  console.log('-'.repeat(80));
  console.log(
    'Framework'.padEnd(12) +
      'Mean'.padEnd(10) +
      'Median'.padEnd(10) +
      'P95'.padEnd(10) +
      'P99'.padEnd(10) +
      'Min'.padEnd(10) +
      'vs Kozo'
  );
  console.log('-'.repeat(80));
  for (const r of sortedPost) {
    const ratio = r.post.mean / kozo.post.mean;
    const vs = r.name === 'Kozo' ? '(baseline)' : `${ratio.toFixed(2)}x`;
    console.log(
      r.name.padEnd(12) +
        formatMicro(r.post.mean).padEnd(10) +
        formatMicro(r.post.median).padEnd(10) +
        formatMicro(r.post.p95).padEnd(10) +
        formatMicro(r.post.p99).padEnd(10) +
        formatMicro(r.post.min).padEnd(10) +
        vs
    );
  }

  console.log('\n✅ Done.');
}

main().catch(console.error);
