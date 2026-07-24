/**
 * H1 / F-01 — repository-wide guard.
 *
 * A hardcoded JWT secret shipped to npm in three template trees and four
 * scaffold generators. The fix is only durable if a reintroduction fails the
 * build, so this walks the whole source tree and asserts that no known-weak
 * secret literal, and no `process.env.<X>_SECRET || 'literal'` fallback,
 * survives anywhere except the blocklist that defines them.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { KNOWN_WEAK_SECRETS } from '@kozojs/core';

import { repoRoot } from './helpers/repo-root.js';

const ROOT = repoRoot();

/** Directories that are never source of truth. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.changeset',
  'dist',
  'coverage',
  '.packs',
  'lib', // tsup build output — regenerated from src, and carries the blocklist itself
]);

/**
 * Files allowed to contain the literals, with the reason.
 * Keep this list at exactly two entries: the blocklist, and the test that reads it.
 */
const ALLOWED = new Set([
  'packages/core/src/weak-secrets.ts', // the blocklist itself
  'packages/auth/__tests__/weak-secret.test.ts', // asserts each literal is refused
  'packages/cli/__tests__/no-weak-secrets.test.ts', // this file
]);

/** Historical record, not live configuration — must stay readable. */
const ALLOWED_PREFIXES = ['plans/', 'CHANGELOG.md'];

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yml', '.yaml', '.md', '.sh', '.example', '.env', '.toml',
]);

function weakTokenRe(literal: string): RegExp {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}($|[^A-Za-z0-9_-])`);
}

const WEAK = [...KNOWN_WEAK_SECRETS].map((literal) => [literal, weakTokenRe(literal)] as const);
/** A secret read from the environment with `||` or `??` falling back to a literal. */
const FALLBACK_RE = /process\.env\.[A-Za-z_]*SECRET[A-Za-z_]*\s*(\|\||\?\?)\s*['"`]/;
/** The docker-compose spelling: a `:-` default supplied for a secret. */
const COMPOSE_RE = /\$\{[A-Za-z_]*SECRET[A-Za-z_]*:-[^}\s]/;

async function sourceFiles(): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isDirectory() && entry.name.startsWith('.') && entry.name !== '.github') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (TEXT_EXT.has(path.extname(entry.name)) || entry.name.startsWith('.env')) {
        out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  }
  await walk(ROOT);
  return out.sort();
}

function isAllowed(rel: string): boolean {
  return ALLOWED.has(rel) || ALLOWED_PREFIXES.some((p) => rel.startsWith(p));
}

describe('no weak secret survives anywhere in the repository', () => {
  it('scans a plausible number of files', async () => {
    const files = await sourceFiles();
    expect(files.length).toBeGreaterThan(100);
  });

  it('no known-weak secret literal outside the blocklist', async () => {
    const offenders: string[] = [];
    for (const rel of await sourceFiles()) {
      if (isAllowed(rel)) continue;
      const text = await fs.readFile(path.join(ROOT, rel), 'utf8');
      for (const [literal, re] of WEAK) {
        if (re.test(text)) offenders.push(`${rel}: ${JSON.stringify(literal)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no secret read from the environment has a literal fallback', async () => {
    const offenders: string[] = [];
    for (const rel of await sourceFiles()) {
      if (isAllowed(rel)) continue;
      const text = await fs.readFile(path.join(ROOT, rel), 'utf8');
      const fallback = FALLBACK_RE.exec(text);
      if (fallback) offenders.push(`${rel}: ${fallback[0].trim()}`);
      const compose = COMPOSE_RE.exec(text);
      if (compose) offenders.push(`${rel}: ${compose[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the allowlist itself is not stale', async () => {
    for (const rel of ALLOWED) {
      expect(await fs.pathExists(path.join(ROOT, rel)), `${rel} is allowlisted but does not exist`).toBe(true);
    }
  });
});
