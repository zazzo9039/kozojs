#!/usr/bin/env bash
# Create a single monorepo tag v{version} after publishing @kozojs/* to npm.
# Usage (from repo root): ./scripts/tag-release.sh
# Then: git push origin v$(node -p "require('./packages/core/package.json').version")

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VER="$(node -p "require('./packages/core/package.json').version")"
TAG="v${VER}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists on $(git rev-parse --short "$TAG")"
  exit 0
fi

git tag -a "$TAG" -m "Release @kozojs/* ${VER}"
echo "Created $TAG"
echo "Push: git push origin $TAG"
