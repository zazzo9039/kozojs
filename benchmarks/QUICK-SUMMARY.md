# Quick Summary

## 🏆 Kozo vs Competition

| Metric | vs uWS bare | vs Fastify | vs NestJS |
|--------|-------------|------------|-----------|
| **Throughput** | 🟢 **~equivalent** (+0.1%) | 🟢 **+33%** | 🟢 **+324%** |
| **GET Latency** | 🟢 ~equivalent | 🟢 **+142% faster** | 🟢 **+104% faster** |
| **POST Latency** | 🟢 ~equivalent | 🟢 **+218% faster** | 🟢 **+162% faster** |

## 📊 Key Numbers

```
Throughput: Kozo 17,510/s | uWS bare 17,496/s | Fastify 13,210/s | NestJS 4,131/s
GET Lat:    Kozo 317μs    | NestJS 648μs      | Fastify 766μs
POST Lat:   Kozo 255μs    | NestJS 669μs      | Fastify 812μs
```

## ✅ Verdict

**Kozo matches bare uWS** (0.1% gap) while providing full decorator + DI support, file-system routing, and TypeScript-first development.

**Kozo is 33% faster than Fastify** and **3x faster than NestJS** with zero framework overhead in the hot path — route matching is done by uWS's native C++ trie.

## 🚀 Best Performance Settings

```typescript
import { createKozo } from '@kozojs/core';

const app = createKozo();
// register routes …
await app.nativeListen(3000); // registers routes into uWS C++ trie
```

## 📋 Methodology

See **[METHODOLOGY.md](./METHODOLOGY.md)** for presets, comparable routes, and kozo-native-api app benchmarks.

Load testing defaults to **`BENCH_CONFIG=docs`** (10 concurrent connections, 10 seconds, pipelining 1) on **`GET /api/health`**. Interleaved latency benchmarks use `request-overhead-fair.bench.ts`.
