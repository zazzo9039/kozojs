import 'reflect-metadata';
import autocannon from 'autocannon';
import Fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestAutocannonModule } from './fixtures/nestjs-autocannon.fixture';
import { setupKozoAutocannon } from './fixtures/kozo-autocannon.fixture';
import { setupUwsAutocannon } from './fixtures/uws-autocannon.fixture';

// ===== Benchmark Configuration =====

interface BenchConfig {
  connections: number;
  duration: number;
  pipelining: number;
}

const BENCH_CONFIGS: Record<string, BenchConfig> = {
  light:  { connections: 10,  duration: 5,  pipelining: 1 },
  medium: { connections: 50,  duration: 10, pipelining: 1 },
  heavy:  { connections: 100, duration: 15, pipelining: 10 },
};

// ===== Runner =====

function runAutocannon(url: string, config: BenchConfig): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    const instance = autocannon({ url, ...config }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: false });
  });
}

function formatReqSec(n: number) {
  return n.toFixed(0).padStart(8) + ' req/s';
}

function formatLatency(n: number) {
  return n.toFixed(2).padStart(8) + 'ms';
}

// ===== Main =====

async function main() {
  const CONFIG_NAME = process.env.BENCH_CONFIG ?? 'medium';
  const config = BENCH_CONFIGS[CONFIG_NAME] ?? BENCH_CONFIGS.medium;

  console.log('\n🔥 Autocannon Throughput Benchmark');
  console.log('='.repeat(60));
  console.log(`Config: ${CONFIG_NAME} | connections=${config.connections} | duration=${config.duration}s | pipelining=${config.pipelining}\n`);

  // ---- Fastify ----
  console.log('📊 Starting Fastify...');
  const fastify = Fastify({ logger: false });
  const fastifyUsers: any[] = [];
  fastify.get('/api/users', async () => fastifyUsers);
  fastify.post('/api/users', async (req: any, reply: any) => {
    const user = { id: Date.now().toString(), ...(req.body as any) };
    fastifyUsers.push(user);
    reply.status(201);
    return user;
  });
  await fastify.listen({ port: 0 });
  const fastifyPort = (fastify.server.address() as any).port;
  console.log(`   Fastify listening on :${fastifyPort}`);
  const fastifyResult = await runAutocannon(`http://127.0.0.1:${fastifyPort}/api/users`, config);
  await fastify.close();

  // ---- NestJS ----
  console.log('📊 Starting NestJS...');
  const nestApp = await NestFactory.create(NestAutocannonModule, new FastifyAdapter(), { logger: false });
  await nestApp.listen(0);
  const nestPort = (nestApp.getHttpServer().address() as any).port;
  console.log(`   NestJS listening on :${nestPort}`);
  const nestResult = await runAutocannon(`http://127.0.0.1:${nestPort}/api/users`, config);
  await nestApp.close();

  // ---- uWS bare ----
  console.log('📊 Starting uWS bare...');
  const { port: uwsPort, server: uwsServer } = await setupUwsAutocannon();
  console.log(`   uWS bare listening on :${uwsPort}`);
  const uwsResult = await runAutocannon(`http://127.0.0.1:${uwsPort}/api/users`, config);
  uwsServer.close();

  // ---- Kozo ----
  console.log('📊 Starting Kozo...');
  const { port: kozoPort, server: kozoServer } = await setupKozoAutocannon();
  console.log(`   Kozo listening on :${kozoPort}`);
  const kozoResult = await runAutocannon(`http://127.0.0.1:${kozoPort}/api/users`, config);
  kozoServer.close();

  // ===== Results =====
  const results = [
    { name: 'Kozo',      req: kozoResult.requests.average,    lat: kozoResult.latency.mean,    p99: kozoResult.latency.p99 },
    { name: 'uWS bare',  req: uwsResult.requests.average,     lat: uwsResult.latency.mean,     p99: uwsResult.latency.p99 },
    { name: 'Fastify',   req: fastifyResult.requests.average, lat: fastifyResult.latency.mean, p99: fastifyResult.latency.p99 },
    { name: 'NestJS',    req: nestResult.requests.average,    lat: nestResult.latency.mean,    p99: nestResult.latency.p99 },
  ];

  // Sort by throughput descending
  results.sort((a, b) => b.req - a.req);

  console.log('\n' + '='.repeat(60));
  console.log('📈 RESULTS — Throughput (GET /api/users)');
  console.log('='.repeat(60));
  console.log(
    '\n' +
    'Framework'.padEnd(14) +
    'Req/sec'.padStart(14) +
    'Latency'.padStart(12) +
    'p99 lat'.padStart(12)
  );
  console.log('-'.repeat(54));
  for (const r of results) {
    const rank = r === results[0] ? ' 🏆' : '';
    console.log(
      (r.name + rank).padEnd(16) +
      formatReqSec(r.req).padStart(14) +
      formatLatency(r.lat).padStart(12) +
      formatLatency(r.p99).padStart(12)
    );
  }

  // ===== Comparison vs Kozo =====
  const kozo = results.find(r => r.name === 'Kozo')!;
  console.log('\n📊 vs Kozo throughput:');
  for (const r of results.filter(r => r.name !== 'Kozo')) {
    const diff = ((kozo.req - r.req) / r.req * 100);
    const arrow = diff > 0 ? '🟢' : '🔴';
    console.log(`  ${arrow} ${r.name.padEnd(10)} Kozo is ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'faster' : 'slower'}`);
  }

  console.log('');
}

main().catch(console.error);
