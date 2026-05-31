# Benchmark Methodology

Single reference for **kozo/benchmarks** (framework comparison) and **kozo-native-api/benchmarks** (real app).

## Tool

[autocannon](https://github.com/mcollina/autocannon) v7 — same metrics everywhere:

| Metric | autocannon field |
|---|---|
| Throughput | `requests.average` (req/s) |
| Latency mean | `latency.mean` (ms) |
| Latency p99 | `latency.p99` (ms) |
| Errors | `errors + timeouts + non2xx` |

## Presets (`BENCH_CONFIG`)

| Preset | Connections | Duration | Pipelining | Use case |
|---|---:|---:|---:|---|
| **`docs`** (default) | 10 | 10s | 1 | **Official numbers** — compare with RESULTS.md / docs site |
| `light` | 10 | 5s | 1 | Quick smoke test |
| `medium` | 50 | 10s | 1 | Sustained concurrency, no pipelining |
| `heavy` | 50 | 15s | 5 | Stress (GET routes); POST/DB scenarios force pipelining 1 |

```bash
# Framework comparison (Kozo vs Fastify vs NestJS vs uWS bare)
cd kozo/benchmarks
BENCH_CONFIG=docs pnpm bench:autocannon
```

Framework runs use **random order** + **3s cooldown** between each (`BENCH_COOLDOWN_MS`, `BENCH_ORDER=fixed` to disable shuffle). This avoids sequential bias when comparing on one machine.

```bash
# Real app (kozo-native-api must be running on :3001)
cd kozo-native-api
BENCH_CONFIG=docs pnpm bench
BENCH_CONFIG=heavy BENCH_SKIP_STRIPE=1 pnpm bench
```

## Two benchmark suites

### 1. `kozo/benchmarks` — framework comparison

Minimal in-memory fixtures, same endpoints on all frameworks:

| Route | Purpose |
|---|---|
| **`GET /api/health`** | **Official throughput table** (published 17,510 req/s) |
| `GET /api/users` | Secondary: in-memory list + Zod validation overhead |

Does **not** hit Postgres, Stripe, or bcrypt.

### 2. `kozo-native-api/benchmarks` — production app

| Scenario | Route | Notes |
|---|---|---|
| health | `GET /api/health` | Comparable to framework `docs` preset |
| public-seo | `GET /api/public/seo` | Static JSON |
| stats / users | DB routes | Not comparable to framework fixtures |
| login | `POST /api/auth/login` | bcrypt + DB; pipelining forced to 1 |
| billing-* | Stripe | **Excluded by default** (`BENCH_SKIP_STRIPE=1`) |

## Published numbers (RESULTS.md)

Collected with **`BENCH_CONFIG=docs`** on **`GET /api/health`**:

| Framework | Req/s | Latency avg | p99 |
|---|---:|---:|---:|
| Kozo | 17,510 | ~0.57 ms | ~1.0 ms |
| uWS bare | 17,496 | ~0.57 ms | ~1.0 ms |
| Fastify | 13,210 | ~0.76 ms | ~1.2 ms |
| NestJS | 4,131 | ~2.42 ms | ~4.0 ms |

> ⚠️ Re-run on your hardware before quoting in production. Environment: Linux recommended, Node 20+, close other apps.

## What is NOT comparable

- **native-api req/s on `/api/users`** (Postgres) vs **framework `/api/users`** (in-memory `[]`)
- **native-api absolute req/s** vs **docs** without same preset (`docs`), route (`/api/health`), and machine
- **Stripe/billing** routes under load (rate limits — excluded by default)
