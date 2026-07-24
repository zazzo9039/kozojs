import fs from 'node:fs';
import path from 'node:path';

/**
 * Walk up from the current working directory until `pnpm-workspace.yaml` is
 * found. vitest runs with cwd set to the package, but relative `../..` hops
 * break the moment a test file moves.
 */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate the repo root (no pnpm-workspace.yaml above ${process.cwd()})`);
}
