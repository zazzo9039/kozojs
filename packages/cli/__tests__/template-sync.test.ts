/**
 * H1 — the three starter-template trees must not drift.
 *
 * `templates/` at the repo root is the single source of truth.
 * `packages/cli/templates/` is derived from it by `scripts/copy-cli-templates.mjs`,
 * which runs as part of `@kozojs/cli`'s build, and is committed because it is
 * what npm publishes.
 * `examples/file-routing/` is the same starter wired to the workspace so it can
 * actually be run; it is allowed to differ only in the files listed in
 * `EXAMPLE_DIVERGENCE`.
 *
 * Without this test a security fix can land in one copy and silently miss the
 * other two — which is exactly how F-01 came to exist in triplicate.
 *
 * `pnpm test` already runs under turbo on every CI job, so this needs no new
 * build step and no new workflow.
 *
 * One caveat, deliberately not papered over: turbo's `test` task depends on
 * `build`, and the CLI build runs the sync script — so by the time this test
 * executes, drift in `packages/cli/templates` has already been repaired. The
 * assertion below is therefore a local-development net, not the CI gate. The CI
 * gate is `node scripts/copy-cli-templates.mjs --check`, which runs before the
 * build. The `examples/` comparison has no such caveat: nothing repairs it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

import { repoRoot } from './helpers/repo-root.js';
import { copyTemplate, kozoDependencyRange, TEMPLATE_NAMES } from '../src/utils/copy-template.js';

const ROOT = repoRoot();
const SOURCE = path.join(ROOT, 'templates');
const CLI_COPY = path.join(ROOT, 'packages', 'cli', 'templates');
const EXAMPLE = path.join(ROOT, 'examples', 'file-routing');
const EXAMPLE_SOURCE = path.join(SOURCE, 'file-routing');

/**
 * Files the runnable example is allowed to differ on, with the reason. Anything
 * not listed here must be byte-identical to the template. Keep this list short:
 * every entry is a place a fix has to be applied twice.
 */
const EXAMPLE_DIVERGENCE: Record<string, string> = {
  'package.json': 'example uses workspace:* deps and a vitest script; template uses published ranges and {{PROJECT_NAME}}',
  'README.md': 'example documents how to run it from the monorepo',
  'src/index.ts': 'example calls listen() directly; template tries nativeListen() first',
};

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.turbo' || entry.name === 'dist') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(dir, full).replace(/\\/g, '/'));
    }
  }
  await walk(dir);
  return out.sort();
}

const read = (base: string, rel: string) => fs.readFile(path.join(base, rel), 'utf8');

describe('template trees stay in sync', () => {
  it('finds all three trees', async () => {
    expect(await fs.pathExists(SOURCE)).toBe(true);
    expect(await fs.pathExists(CLI_COPY)).toBe(true);
    expect(await fs.pathExists(EXAMPLE)).toBe(true);
  });

  it('packages/cli/templates is an exact copy of templates/', async () => {
    const source = await listFiles(SOURCE);
    const copy = await listFiles(CLI_COPY);

    expect(source.length).toBeGreaterThan(0);
    expect(copy, 'file set differs — run `pnpm --filter @kozojs/cli build` to resync').toEqual(source);

    const differing: string[] = [];
    for (const rel of source) {
      if ((await read(SOURCE, rel)) !== (await read(CLI_COPY, rel))) differing.push(rel);
    }
    expect(
      differing,
      'packages/cli/templates is generated from templates/ — edit templates/ and rebuild, never the copy',
    ).toEqual([]);
  });

  it('examples/file-routing matches the template except where divergence is declared', async () => {
    const templateFiles = await listFiles(EXAMPLE_SOURCE);
    expect(templateFiles.length).toBeGreaterThan(0);

    const missing: string[] = [];
    const differing: string[] = [];
    for (const rel of templateFiles) {
      if (rel in EXAMPLE_DIVERGENCE) continue;
      if (!(await fs.pathExists(path.join(EXAMPLE, rel)))) {
        missing.push(rel);
        continue;
      }
      if ((await read(EXAMPLE_SOURCE, rel)) !== (await read(EXAMPLE, rel))) differing.push(rel);
    }

    expect(missing, 'present in templates/file-routing but absent from examples/file-routing').toEqual([]);
    expect(
      differing,
      'copy the file from templates/file-routing, or add it to EXAMPLE_DIVERGENCE with a reason',
    ).toEqual([]);
  });

  it('every declared divergence is real, so the allowlist cannot rot', async () => {
    const stale: string[] = [];
    for (const rel of Object.keys(EXAMPLE_DIVERGENCE)) {
      const inTemplate = path.join(EXAMPLE_SOURCE, rel);
      const inExample = path.join(EXAMPLE, rel);
      if (!(await fs.pathExists(inTemplate)) || !(await fs.pathExists(inExample))) {
        stale.push(`${rel}: listed as divergent but missing from one of the trees`);
        continue;
      }
      if ((await read(EXAMPLE_SOURCE, rel)) === (await read(EXAMPLE, rel))) {
        stale.push(`${rel}: identical in both trees — remove it from EXAMPLE_DIVERGENCE`);
      }
    }
    expect(stale).toEqual([]);
  });
});

describe('published starter versions', () => {
  it.each(TEMPLATE_NAMES)('%s resolves Kozo dependencies from the CLI version', async (template) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-template-version-'));
    const dest = path.join(tmp, 'project');

    try {
      await copyTemplate(template, dest, 'version-probe');
      const manifest = await fs.readJSON(path.join(dest, 'package.json')) as {
        dependencies?: Record<string, string>;
      };
      const kozoDependencies = Object.entries(manifest.dependencies ?? {})
        .filter(([name]) => name.startsWith('@kozojs/'));

      expect(kozoDependencies.length).toBeGreaterThan(0);
      for (const [, range] of kozoDependencies) {
        expect(range).toBe(kozoDependencyRange());
      }
      expect(JSON.stringify(manifest)).not.toContain('{{KOZO_VERSION}}');
    } finally {
      await fs.remove(tmp);
    }
  });
});
