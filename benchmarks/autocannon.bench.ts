import 'reflect-metadata';
import autocannon from 'autocannon';
import Fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { NestAutocannonModule } from './fixtures/nestjs-autocannon.fixture';
import { setupKozoAutocannon } from './fixtures/kozo-autocannon.fixture';
import { setupUwsAutocannon } from './fixtures/uws-autocannon.fixture';
import { resolveBenchConfig, type BenchConfig } from './config.js';

const ROUTES = {
  health: '/api/health',
  users: '/api/users',
} as const;

type RouteName = keyof typeof ROUTES;
type FrameworkName = 'Kozo' | 'uWS bare' | 'Fastify' | 'NestJS';

interface FrameworkResult {
  name: FrameworkName;
  health: autocannon.Result;
  users: autocannon.Result;
}

const COOLDOWN_MS = Number(process.env.BENCH_COOLDOWN_MS ?? 3000);
const FRAMEWORKS: FrameworkName[] = ['Kozo', 'uWS bare', 'Fastify', 'NestJS'];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function resolveRunOrder(): FrameworkName[] {
  if (process.env.BENCH_ORDER === 'fixed') {
    return ['Kozo', 'uWS bare', 'NestJS', 'Fastify'];
  }
  return shuffle(FRAMEWORKS);
}

function runAutocannon(url: string, config: BenchConfig): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    const instance = autocannon({ url, ...config }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: false });
  });
}

function errors(result: autocannon.Result): number {
  return result.errors + result.timeouts + result.non2xx;
}

function formatReqSec(n: number) {
  return n.toFixed(0).padStart(8) + ' req/s';
}

function formatLatency(n: number) {
  return n.toFixed(2).padStart(8) + 'ms';
}

async function benchKozo(config: BenchConfig): Promise<FrameworkResult> {
  const { port, server } = await setupKozoAutocannon();
  const base = `http://127.0.0.1:${port}`;
  const health = await runAutocannon(`${base}${ROUTES.health}`, config);
  const users = await runAutocannon(`${base}${ROUTES.users}`, config);
  server.close();
  return { name: 'Kozo', health, users };
}

async function benchUwsBare(config: BenchConfig): Promise<FrameworkResult> {
  const { port, server } = await setupUwsAutocannon();
  const base = `http://127.0.0.1:${port}`;
  const health = await runAutocannon(`${base}${ROUTES.health}`, config);
  const users = await runAutocannon(`${base}${ROUTES.users}`, config);
  server.close();
  return { name: 'uWS bare', health, users };
}

async function benchNestJs(config: BenchConfig): Promise<FrameworkResult> {
  const nestApp = await NestFactory.create(NestAutocannonModule, new FastifyAdapter(), { logger: false });
  await nestApp.listen(0);
  const port = (nestApp.getHttpServer().address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const health = await runAutocannon(`${base}${ROUTES.health}`, config);
  const users = await runAutocannon(`${base}${ROUTES.users}`, config);
  await nestApp.close();
  return { name: 'NestJS', health, users };
}

async function benchFastify(config: BenchConfig): Promise<FrameworkResult> {
  const fastify = Fastify({ logger: false });
  const fastifyUsers: unknown[] = [];
  fastify.get(ROUTES.health, async () => ({ status: 'ok', timestamp: Date.now() }));
  fastify.get(ROUTES.users, async () => fastifyUsers);
  fastify.post(ROUTES.users, async (req: any, reply: any) => {
    const user = { id: Date.now().toString(), ...(req.body as object) };
    fastifyUsers.push(user);
    reply.status(201);
    return user;
  });
  await fastify.listen({ port: 0 });
  const port = (fastify.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const health = await runAutocannon(`${base}${ROUTES.health}`, config);
  const users = await runAutocannon(`${base}${ROUTES.users}`, config);
  await fastify.close();
  return { name: 'Fastify', health, users };
}

const RUNNERS: Record<FrameworkName, (config: BenchConfig) => Promise<FrameworkResult>> = {
  Kozo: benchKozo,
  'uWS bare': benchUwsBare,
  Fastify: benchFastify,
  NestJS: benchNestJs,
};

function printTable(title: string, route: RouteName, results: FrameworkResult[]) {
  const sorted = [...results].sort(
    (a, b) => b[route].requests.average - a[route].requests.average,
  );

  console.log('\n' + '='.repeat(72));
  console.log(`📈 ${title}`);
  console.log('='.repeat(72));
  console.log(
    '\n' +
      'Framework'.padEnd(14) +
      'Req/sec'.padStart(14) +
      'Latency'.padStart(12) +
      'p99 lat'.padStart(12) +
      'Errors'.padStart(10),
  );
  console.log('-'.repeat(62));

  for (const r of sorted) {
    const result = r[route];
    const rank = r === sorted[0] ? ' 🏆' : '';
    console.log(
      (r.name + rank).padEnd(16) +
        formatReqSec(result.requests.average).padStart(14) +
        formatLatency(result.latency.mean).padStart(12) +
        formatLatency(result.latency.p99).padStart(12) +
        String(errors(result)).padStart(10),
    );
  }
}

function printVsKozo(route: RouteName, results: FrameworkResult[]) {
  const kozo = results.find((r) => r.name === 'Kozo');
  if (!kozo) return;

  console.log(`\n📊 vs Kozo (${ROUTES[route]}):`);
  for (const r of results.filter((x) => x.name !== 'Kozo')) {
    const diff = ((kozo[route].requests.average - r[route].requests.average) / r[route].requests.average) * 100;
    const arrow = diff > 0 ? '🟢' : '🔴';
    console.log(
      `  ${arrow} ${r.name.padEnd(10)} Kozo is ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'faster' : 'slower'}`,
    );
  }
}

async function main() {
  const configName = process.env.BENCH_CONFIG ?? 'docs';
  const config = resolveBenchConfig(configName);
  const order = resolveRunOrder();

  console.log('\n🔥 Autocannon Throughput Benchmark (framework comparison)');
  console.log('='.repeat(72));
  console.log(
    `Config: ${configName} | connections=${config.connections} | duration=${config.duration}s | pipelining=${config.pipelining}`,
  );
  console.log(`Order: ${order.join(' → ')} (set BENCH_ORDER=fixed to disable shuffle)`);
  console.log(`Cooldown: ${COOLDOWN_MS}ms between frameworks (BENCH_COOLDOWN_MS)`);
  console.log('See METHODOLOGY.md — official table uses GET /api/health with BENCH_CONFIG=docs\n');

  const results: FrameworkResult[] = [];
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    console.log(`📊 ${name}…`);
    results.push(await RUNNERS[name](config));
    if (i < order.length - 1) {
      console.log(`⏸ Cooldown ${COOLDOWN_MS}ms…`);
      await sleep(COOLDOWN_MS);
    }
  }

  printTable('OFFICIAL — GET /api/health (published in RESULTS.md)', 'health', results);
  printVsKozo('health', results);

  printTable('SECONDARY — GET /api/users (in-memory + validation)', 'users', results);
  printVsKozo('users', results);

  console.log('');
}

main().catch(console.error);
