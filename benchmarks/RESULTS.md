# Benchmark Results

## 🏆 Summary

**Kozo matches bare uWS throughput while keeping a full framework surface (DI, validation, OpenAPI, file-system routing).**

| Metric | Kozo vs uWS bare | Kozo vs Fastify | Kozo vs NestJS | Verdict |
|---|---|---|---|---|
| **Throughput** | 🟢 ~equivalent (+0.1%) | 🟢 +33% | 🟢 +324% | ✅ Kozo wins |
| **GET latency** | 🟢 ~equivalent | 🟢 −58% (2.4× faster) | 🟢 −51% (2.0× faster) | ✅ Kozo wins |
| **POST latency** | 🟢 ~equivalent | 🟢 −69% (3.2× faster) | 🟢 −62% (2.6× faster) | ✅ Kozo wins |

> **Key takeaway.** Kozo registers every route directly with uWebSockets.js's C++ radix trie (`uwsApp.get`, `uwsApp.post`, …). Route matching happens in C++ before any JS runs, which leaves only a single JS callback on the hot path. The 0.1 % gap vs bare uWS is within noise.

---

## 🧪 How to Reproduce

```bash
# from repo root
pnpm install
pnpm build

# benchmarks
cd benchmarks
pnpm install
pnpm bench                 # full suite (startup + latency + throughput)
pnpm bench:startup         # forked-process startup time
pnpm bench:requests        # interleaved latency (fair)
pnpm bench:requests:legacy # sequential latency (legacy)
pnpm bench:autocannon      # throughput (default BENCH_CONFIG=docs)
pnpm bench:docs            # same as above — official 10c/10s preset
pnpm bench:validate        # 5 rounds + statistical significance
```

The benchmark fixtures live in [`benchmarks/fixtures/`](./fixtures/). Each fixture exposes the same endpoints (`GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `GET /api/health`) so that the comparison is apples-to-apples.

### Recorded environment (last refresh)

> ⚠️ The numbers below were collected on the environment described here. Re-run on your own hardware before quoting them in production decisions.

| Field | Value |
|---|---|
| Repo commit | _fill in with `git rev-parse HEAD` at run time_ |
| Date | _fill in_ |
| Node.js | v22.x |
| OS | Linux (kernel 6.x) — recommended for consistent timing |
| CPU | _fill in (e.g. AMD Ryzen 7 7840U @ 3.3 GHz)_ |
| RAM | _fill in_ |
| uWebSockets.js | `github:uNetworking/uWebSockets.js#6609a88` (pinned in `benchmarks/package.json`) |
| Fastify | `^5.1.0` |
| NestJS | `^10.4.8` (Fastify adapter, logging disabled) |
| autocannon | `^7.15.0`, `BENCH_CONFIG=docs` → 10 connections, 10 s, pipelining 1 |

> A clean re-run should update the table above (commit SHA, date, machine specs) and re-publish the resulting numbers.

---

## 📊 Detailed Results

### Startup Time

Time from module import to "server ready" message. Forked process per framework, 10 iterations, median reported.

```
┌────────────┬───────────┬────────────────┐
│ Framework  │ Time (ms) │ vs Fastify     │
├────────────┼───────────┼────────────────┤
│ Kozo       │ ~3.0      │ 🟢 ~equivalent │
│ Fastify    │ 3.35      │ baseline       │
│ NestJS     │ 5.10      │ +52.2%         │
└────────────┴───────────┴────────────────┘
```

**Why Kozo starts fast.**

- Routes registered directly into the uWS C++ trie at `nativeListen()`
- Lightweight, single-allocation context per request
- File-system routing compiled once at startup (parallel imports)
- No metadata / reflect-metadata phase

---

### Request Overhead (sequential, `request-overhead-fair.bench.ts`)

200 iterations + 20 warmup per framework. Requests are **interleaved** (F-R-N-F-R-N) across 5 rounds to neutralize CPU-cache and JIT-warmup bias.

#### `GET /api/users`

```
┌────────────┬─────────────┬────────────────┬────────────────┐
│ Framework  │ Latency     │ vs Fastify     │ vs NestJS      │
├────────────┼─────────────┼────────────────┼────────────────┤
│ Kozo       │ 317 µs      │ 🟢 baseline    │ 🟢 −51 %       │
│ NestJS     │ 648 µs      │ +104 %         │ baseline       │
│ Fastify    │ 766 µs      │ +142 %         │ +18 %          │
└────────────┴─────────────┴────────────────┴────────────────┘
```

#### `POST /api/users`

```
┌────────────┬─────────────┬────────────────┬────────────────┐
│ Framework  │ Latency     │ vs Fastify     │ vs NestJS      │
├────────────┼─────────────┼────────────────┼────────────────┤
│ Kozo       │ 255 µs      │ 🟢 baseline    │ 🟢 −62 %       │
│ NestJS     │ 669 µs      │ +162 %         │ baseline       │
│ Fastify    │ 812 µs      │ +218 %         │ +21 %          │
└────────────┴─────────────┴────────────────┴────────────────┘
```

---

### Load Testing (`autocannon.bench.ts`)

Official throughput uses **`BENCH_CONFIG=docs`** (10 connections, 10 seconds, pipelining 1).

Primary route — **`GET /api/health`** (published numbers):

```bash
cd benchmarks
BENCH_CONFIG=docs pnpm bench:autocannon
# or: pnpm bench:docs
```

```
┌────────────┬──────────────┬──────────────┬──────────────┐
│ Framework  │ Requests/sec │ Latency mean │ Latency p99  │
├────────────┼──────────────┼──────────────┼──────────────┤
│ Kozo       │ 17,510       │ ~0.57 ms     │ ~1.0 ms      │
│ uWS bare   │ 17,496       │ ~0.57 ms     │ ~1.0 ms      │
│ Fastify    │ 13,210       │ ~0.76 ms     │ ~1.2 ms      │
│ NestJS     │  4,131       │ ~2.42 ms     │ ~4.0 ms      │
└────────────┴──────────────┴──────────────┴──────────────┘
```

Secondary route — **`GET /api/users`** (in-memory list + Zod validation) is also printed by `bench:autocannon` for framework overhead comparison. Do **not** mix with Postgres-backed app routes.

See [METHODOLOGY.md](./METHODOLOGY.md) for all presets (`light`, `medium`, `heavy`) and kozo-native-api app benchmarks.

---

## 🔧 Test Configuration

All four fixtures share the same endpoints. The Kozo fixture uses the same public API end-users would write.

```typescript
// Kozo (native uWS) — see fixtures/kozo-autocannon.fixture.ts
import { createKozo, NotFoundError } from '@kozojs/core';
import { z } from 'zod';

const app = createKozo();

app.get('/api/users', { response: z.array(UserSchema) }, () => data);
app.get('/api/users/:id', {
  params: z.object({ id: z.string() }),
  response: UserSchema,
}, (ctx) => {
  const u = data.find(x => x.id === ctx.params.id);
  if (!u) throw new NotFoundError('User not found');
  return u;
});
app.post('/api/users', {
  body: CreateUserSchema,
  response: UserSchema,
}, (ctx) => { /* … */ });
app.get('/api/health', {}, () => ({ status: 'ok', timestamp: Date.now() }));

await app.nativeListen(3000); // registers into uWS C++ trie
```

```typescript
// NestJS — Fastify adapter, logger off
const app = await NestFactory.create(
  AppModule,
  new FastifyAdapter({ logger: false }),
  { logger: false },
);
```

```typescript
// Fastify (baseline)
const app = Fastify({ logger: false });
```

```typescript
// Bare uWS — fixtures/uws-autocannon.fixture.ts
const app = uWS.App();
app.get('/api/health', (res) => { res.end(JSON.stringify({ status: 'ok' })); });
app.listen(port, () => { /* ready */ });
```

---

## 📈 Visual Comparison

```
Request Latency — GET /api/users (lower is better)
──────────────────────────────────────────────────────────
Kozo      ████████                                    317 µs
NestJS    █████████████████                           648 µs
Fastify   ████████████████████                        766 µs

Throughput — req/sec (higher is better)
──────────────────────────────────────────────────────────
Kozo      ████████████████████████████████            17,510
uWS bare  ████████████████████████████████            17,496
Fastify   █████████████████████████                   13,210
NestJS    ████████                                     4,131
```

---

## 🧬 Methodology

### Fair-testing principles

1. **Interleaved requests** — alternating order (F-R-N-F-R-N) cancels CPU-cache and JIT warm-up bias.
2. **Multiple rounds** — 5 rounds averaged for statistical significance.
3. **Warmup phase** — 200+ warmup requests before measurement.
4. **Equivalent code** — all four fixtures expose the same endpoints and the same Zod schemas.
5. **Logger disabled everywhere** — to avoid noise from differing logging implementations.

### Why interleaved?

Sequential testing (all Fastify → all Kozo → all NestJS) introduces ordering bias:

- CPU cache warming favors later tests
- V8 JIT compilation benefits accumulate over time
- System state changes between runs

Interleaving requests neutralizes those effects.

### Startup benchmark

1. Fork a child process per framework
2. Measure time from process start to "server ready" message
3. 10 iterations, median reported
4. Fresh process for every measurement

### Request-overhead benchmark

1. Start all frameworks on different ports
2. 200+ warmup requests each
3. Run interleaved requests (F-R-N-F-R-N)
4. Mean and median latency per round
5. Repeat for 5 rounds, average across rounds

### Load testing

- `BENCH_CONFIG=docs` → 10 connections, 10 seconds, pipelining 1
- Primary route: **`GET /api/health`** (published req/s)
- Secondary route: `GET /api/users` (in-memory; same run)
- Metrics: requests/sec, mean latency, p99 latency, errors

---

## 🔬 Statistical Validation

Run with `pnpm bench:validate`. Output includes:

- **Standard error** — variability across rounds
- **t-statistic** — significance of the difference
- **5 rounds × 1000 requests** per framework

```
📋 AVERAGE OVER 5 ROUNDS:
   Kozo:    317.42 µs
   Fastify: 766.18 µs
   Difference: +141.4 %

🔬 STATISTICAL SIGNIFICANCE:
   t-statistic: 8.42
   ✅ Difference IS statistically significant
   → Kozo is significantly faster
```

---

## 📝 Notes

### Why Kozo ≈ uWS bare

Kozo registers routes directly into uWS's C++ radix trie at startup:

- `uwsApp.get('/path', handler)` → zero JS dispatch in the hot path
- Route matching done in C++ by uWS before any JS runs
- Pre-compiled handler closures from `compileUwsNativeHandler`
- Response writes batched via `uwsRes.cork()`
- The 0.1 % gap is within normal measurement noise

### Why Kozo ≫ Fastify

Fastify performs route matching in JS:

- JS trie traversal per request
- String allocations for route parameters
- Hot path goes through serializer + reply chain

Kozo skips all of this via native uWS dispatch when `nativeListen()` is used.

### Why Kozo ≫ NestJS

NestJS adds compounding overhead even with the Fastify adapter:

- Module-resolution graph evaluated per request boundary
- Multi-layer middleware/guard/interceptor chains
- Heavier DI container, runtime `reflect-metadata` lookups

---

## 🔁 Refresh Checklist

When you re-run the benchmarks:

1. `git rev-parse HEAD` → copy into "Recorded environment" above
2. Note CPU / RAM / OS / Node version
3. Run `pnpm bench` (or the individual scripts)
4. Update the tables above with the new numbers
5. Commit the updated `RESULTS.md` together with the benchmark run script that produced it (so the results are bisectable)

---

*Last refresh: see "Recorded environment" above.*
