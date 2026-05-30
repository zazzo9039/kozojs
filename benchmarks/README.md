# Benchmarks

Performance comparison between Kozo, uWS bare, Fastify, and NestJS.

## 🚀 Quick Start

```bash
npm install
npm run bench
```

## 📊 Available Benchmarks

### Startup Time (`npm run bench:startup`)

Measures framework initialization time from module import to server ready.

```bash
npm run bench:startup
```

### Request Overhead (`npm run bench:requests`)

Measures single-request latency with no concurrent load.

```bash
npm run bench:requests
```

### Load Testing (`npm run bench:autocannon`)

High-concurrency throughput testing using Autocannon.

```bash
npm run bench:autocannon
```

## 🎯 Results Summary

| Metric | Kozo vs NestJS | Kozo vs Fastify | Kozo vs uWS bare |
|--------|----------------|-----------------|------------------|
| Throughput | 🟢 **+324%** | 🟢 **+33%** | 🟡 **~equivalent** |
| Latency | 🟢 **+104% faster** | 🟢 **+142% faster** | 🟡 **~equivalent** |

**Key Takeaway:** Kozo matches bare uWS throughput (0.1% gap) while keeping a full framework surface (Zod validation, DI, OpenAPI, file-system routing). It is ~33% faster than Fastify and ~3× faster than NestJS in our setup.

See [RESULTS.md](./RESULTS.md) for the full numbers, environment, methodology, and reproduction instructions.

## 🔧 Test Configuration

### Kozo (Native uWS)
```typescript
import { createKozo } from '@kozojs/core';

const app = createKozo();
// register routes via app.get / app.post / file-system routing
await app.nativeListen(3000);
```

### NestJS
```typescript
const app = await NestFactory.create(
  AppModule,
  new FastifyAdapter({ logger: false })
);
```

### Fastify (Baseline)
```typescript
const app = Fastify({ logger: false });
```

## 📁 Structure

```
benchmarks/
├── fixtures/
│   ├── kozo-autocannon.fixture.ts   # Kozo server (autocannon)
│   ├── kozo-request.fixture.ts      # Kozo server (latency)
│   ├── kozo-startup.fixture.ts      # Kozo server (startup)
│   ├── nestjs-autocannon.fixture.ts # NestJS server
│   ├── nestjs-request.fixture.ts    # NestJS latency fixture
│   ├── nestjs-startup.fixture.ts    # NestJS startup fixture
│   └── uws-autocannon.fixture.ts    # bare uWS server
├── startup-time.bench.ts         # Startup time benchmark
├── request-overhead.bench.ts     # Request latency (sequential)
├── request-overhead-fair.bench.ts # Request latency (fair interleaved)
├── autocannon.bench.ts           # Load testing
├── statistical-validation.ts     # Statistical significance tests
├── RESULTS.md                    # Detailed results
└── QUICK-SUMMARY.md              # Summary table
```

## 🧪 Methodology

### Startup Benchmark
1. Fork child process per framework
2. Measure time from process start to "ready" message
3. Run 5 iterations, take median
4. Fresh process each iteration

### Request Overhead
1. Start all frameworks (different ports)
2. Warm up with 20 requests each
3. Measure 200 sequential requests
4. Calculate mean + median latency

### Load Testing
1. Concurrent connections: 10
2. Duration: 10 seconds
3. Measure requests/second and latency percentiles

## 💡 Tips

### For Best Results
- Run on Linux for consistent timing
- Close other applications
- Run multiple times, compare medians

### Interpreting Results

- **Startup**: Lower is better. Important for serverless/cold starts.
- **Request Latency**: Lower is better. Measures framework overhead.
- **Throughput**: Higher is better. Measures sustained load capacity.

## 📚 Related Documentation

- [Architecture](../docs/architecture.md) - Framework architecture overview
- [Developer Guide](../docs/developer-guide.md) - Includes benchmark tables
