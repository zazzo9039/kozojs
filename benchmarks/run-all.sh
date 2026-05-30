#!/usr/bin/env bash

# Kozo performance benchmark suite

echo "╬════════════════════════════════════════════════════════════════║"
echo "║          KOZO PERFORMANCE BENCHMARKS                           ║"
echo "║    Kozo vs uWS bare vs Fastify vs NestJS                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 1. Startup Time
echo "🔥 Running Startup Time Benchmark..."
npm run bench:startup

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 2. Request Overhead
echo "🚀 Running Request Overhead Benchmark..."
npm run bench:requests

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 3. Autocannon Light
echo "⚡ Running Autocannon Benchmark (Light)..."
npm run bench:autocannon light

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  ALL BENCHMARKS COMPLETED                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
