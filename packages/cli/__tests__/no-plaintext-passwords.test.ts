/**
 * H6 / F-19 — repository-wide guard against plaintext password handling.
 *
 * The starter login route compared passwords in plaintext
 * (`user.password !== ctx.body.password`) and a generator did the same
 * (`u.password === body.password`). Templates are the code users copy first and
 * change last, so a reintroduction must fail the build. This walks the template
 * trees and the scaffold generators and asserts no direct password comparison
 * survives — hashing goes through hashPassword/verifyPassword instead.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';

import { repoRoot } from './helpers/repo-root.js';

const ROOT = repoRoot();

/** Trees that ship code to users: templates, the runnable example, generators. */
const SCAN_ROOTS = [
  'templates',
  'examples/file-routing',
  'packages/cli/templates',
  'packages/cli/src/utils/scaffold',
];

const SKIP_DIRS = new Set(['node_modules', '.turbo', 'dist', 'lib', 'coverage']);

/** This test necessarily contains the forbidden patterns as data. */
const ALLOWED = new Set(['packages/cli/__tests__/no-plaintext-passwords.test.ts']);

/**
 * A direct comparison of a `.password` property — either side — which is what
 * plaintext auth looks like. hashPassword/verifyPassword never compare a
 * `.password` with `===`/`!==`; they hand two derived buffers to
 * timingSafeEqual, so they do not match.
 */
const PLAINTEXT_COMPARE = /\.password\s*[!=]==|[!=]==\s*[\w.]*\.password\b/;

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // a scan root may not exist in every checkout
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) out.push(full);
  }
}

describe('no plaintext password comparison ships to users (F-19)', () => {
  it('templates and generators compare passwords only through hashing', async () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) await walk(path.join(ROOT, root), files);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      const text = await fs.readFile(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (PLAINTEXT_COMPARE.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }

    expect(offenders, `plaintext password comparison found:\n${offenders.join('\n')}`).toEqual([]);
  });
});
