#!/usr/bin/env bash
# ============================================================================
# Build radix.zig → radix.wasm  (requires Zig ≥ 0.13)
# ============================================================================
# Usage:
#   cd packages/core
#   bash src/wasm/build.sh
#
# Output: src/wasm/radix.wasm  (~4-8 KB)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/radix.zig"
OUT="$SCRIPT_DIR/radix.wasm"

# Check Zig is installed
if ! command -v zig &>/dev/null; then
  echo "❌  Zig compiler not found. Install from https://ziglang.org/download/"
  echo "    The WASM radix router is optional — Kozo falls back to RegExp routing."
  exit 1
fi

echo "🔨  Compiling radix.zig → WASM …"

zig build-lib "$SRC" \
  -target wasm32-freestanding \
  -dynamic \
  -O ReleaseFast \
  --export-memory \
  2>&1

# Zig outputs radix.wasm in the current working directory.
# Move it next to the source if it landed elsewhere.
if [[ -f "$PWD/radix.wasm" && "$PWD/radix.wasm" != "$OUT" ]]; then
  mv "$PWD/radix.wasm" "$OUT"
fi

# Also remove the companion .o if zig produced one
rm -f "$PWD/radix.o" "$PWD/radix.wasm.o" 2>/dev/null || true

SIZE=$(wc -c < "$OUT")
echo "✅  Built $OUT  ($SIZE bytes)"
