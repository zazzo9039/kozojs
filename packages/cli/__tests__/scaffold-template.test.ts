import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import { KNOWN_WEAK_SECRETS, MIN_SECRET_BYTES } from '@kozojs/core';

import { getDatabaseSchema } from '../src/utils/scaffold/template-complete.js';
import { scaffoldProject, type ScaffoldOptions } from '../src/utils/scaffold/index.js';
import { kozoDependencyRange } from '../src/utils/copy-template.js';

describe('scaffold templates', () => {
  it('generates sqlite schema by default', () => {
    const schema = getDatabaseSchema('sqlite');
    expect(schema).toContain('sqliteTable');
    expect(schema).toContain("export const users");
  });

  it('generates postgresql schema', () => {
    const schema = getDatabaseSchema('postgresql');
    expect(schema).toContain('pgTable');
  });

  it('generates mysql schema', () => {
    const schema = getDatabaseSchema('mysql');
    expect(schema).toContain('mysqlTable');
  });
});

// ============================================================================
// H1 / F-01 — no scaffold path may write a hardcoded secret into a user project
// ============================================================================

const WEAK = [...KNOWN_WEAK_SECRETS];

/**
 * Match a weak literal as a whole token, so a short entry does not fire inside
 * a longer one that is already listed separately, and a secret is not reported
 * twice for the same occurrence.
 */
function weakTokenRe(literal: string): RegExp {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}($|[^A-Za-z0-9_-])`);
}

/** A secret read from the environment with `||` or `??` falling back to a literal. */
const SECRET_FALLBACK_RE = /process\.env\.[A-Z_]*SECRET[A-Z_]*\s*(\|\||\?\?)/;
/** The docker-compose spelling of the same mistake: a `:-` default for a secret. */
const COMPOSE_DEFAULT_RE = /\$\{[A-Z_]*SECRET[A-Z_]*:-/;

const baseOptions: ScaffoldOptions = {
  projectName: 'weak-secret-probe',
  runtime: 'node',
  template: 'starter',
  database: 'none',
  auth: true,
  frontend: 'none',
  ssr: false,
  extras: [],
  packageSource: 'npm',
};

/** Every branch reachable from `scaffoldProject`. */
const CASES: Array<[string, Partial<ScaffoldOptions>]> = [
  ['starter + sqlite', { template: 'starter', database: 'sqlite' }],
  ['starter + postgres + docker', { template: 'starter', database: 'postgresql', extras: ['docker', 'github-actions'] }],
  ['complete + auth + postgres', { template: 'complete', database: 'postgresql', auth: true, extras: ['docker'] }],
  ['complete + auth + mysql', { template: 'complete', database: 'mysql', auth: true }],
  ['complete + auth + sqlite', { template: 'complete', database: 'sqlite', auth: true }],
  ['complete without auth', { template: 'complete', database: 'sqlite', auth: false }],
  ['api-only + docker + actions', { template: 'api-only', database: 'none', extras: ['docker', 'github-actions'] }],
  ['fullstack react + auth', { template: 'complete', frontend: 'react', database: 'postgresql', auth: true }],
  ['fullstack react + auth + ssr', { template: 'complete', frontend: 'react', database: 'none', auth: true, ssr: true }],
  ['fullstack vue + auth + mysql', { template: 'complete', frontend: 'vue', database: 'mysql', auth: true }],
  ['fullstack solid without auth', { template: 'complete', frontend: 'solid', database: 'sqlite', auth: false }],
];

async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full)));
    else out.push(full);
  }
  return out;
}

/** Scaffold into a throwaway dir and return every generated file as [relPath, text]. */
async function scaffold(overrides: Partial<ScaffoldOptions>): Promise<Array<[string, string]>> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-scaffold-'));
  const cwd = process.cwd();
  try {
    process.chdir(tmp);
    const options = { ...baseOptions, ...overrides };
    await scaffoldProject(options);
    const root = path.join(tmp, options.projectName);
    const files = await collectFiles(root);
    return Promise.all(
      files.map(async (f) => [
        path.relative(root, f).replace(/\\/g, '/'),
        await fs.readFile(f, 'utf8'),
      ] as [string, string]),
    );
  } finally {
    process.chdir(cwd);
    await fs.remove(tmp).catch(() => {});
  }
}

function createKozoConfigKeys(source: string): string[] {
  const sourceFile = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const keys: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createKozo' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const property of node.arguments[0].properties) {
        if (property.name) keys.push(property.name.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return keys;
}

const VALIDITY_CASES: Array<[string, Partial<ScaffoldOptions>, string]> = [
  ['starter', { template: 'starter', database: 'sqlite' }, 'src/index.ts'],
  ['complete', { template: 'complete', database: 'none', auth: true }, 'src/index.ts'],
  ['api-only', { template: 'api-only', database: 'none', auth: false }, 'src/index.ts'],
  ['fullstack', { template: 'complete', frontend: 'react', database: 'none', auth: true }, 'apps/api/src/index.ts'],
];

describe('scaffolded projects use the current Kozo APIs', () => {
  const TIMEOUT = 30_000;

  it.each(VALIDITY_CASES)('%s', async (_name, overrides, entryPath) => {
    const files = await scaffold(overrides);
    const entry = files.find(([rel]) => rel === entryPath);
    expect(entry, `${entryPath} should be generated`).toBeDefined();

    const configKeys = createKozoConfigKeys(entry![1]);
    expect(configKeys).not.toContain('port');
    expect(configKeys).not.toContain('openapi');
    expect(entry![1]).toMatch(/(?:nativeListen|listen)\((?:PORT|3000|\{\s*port:\s*PORT)/);

    if (overrides.template !== 'api-only') {
      expect(entry![1]).toContain('app.mountDocs({');
    }
    if (overrides.template === 'starter') {
      expect(entry![1]).toContain('await app.loadRoutes();');
    }

    const manifestPath = entryPath.startsWith('apps/') ? 'apps/api/package.json' : 'package.json';
    const manifestFile = files.find(([rel]) => rel === manifestPath);
    expect(manifestFile, `${manifestPath} should be generated`).toBeDefined();
    const manifest = JSON.parse(manifestFile![1]) as {
      dependencies?: Record<string, string>;
    };
    const kozoDependencies = Object.entries(manifest.dependencies ?? {})
      .filter(([name]) => name.startsWith('@kozojs/'));
    expect(kozoDependencies.length).toBeGreaterThan(0);
    for (const [, range] of kozoDependencies) {
      expect(range).toBe(kozoDependencyRange());
    }
  }, TIMEOUT);
});

describe('scaffolded projects contain no hardcoded secret', () => {
  // Scaffolding writes a lot of small files; give the slower matrix room.
  const TIMEOUT = 30_000;

  it.each(CASES)('%s', async (_name, overrides) => {
    const files = await scaffold(overrides);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const [rel, text] of files) {
      for (const weak of WEAK) {
        if (weakTokenRe(weak).test(text)) {
          offenders.push(`${rel}: contains known-weak secret ${JSON.stringify(weak)}`);
        }
      }
      const fallback = SECRET_FALLBACK_RE.exec(text);
      if (fallback) offenders.push(`${rel}: secret has a fallback — ${fallback[0]}`);
      const composeDefault = COMPOSE_DEFAULT_RE.exec(text);
      if (composeDefault) offenders.push(`${rel}: compose default for a secret — ${composeDefault[0]}`);
    }

    expect(offenders).toEqual([]);
  }, TIMEOUT);

  it('emits requireSecret() wherever auth is enabled', async () => {
    const files = await scaffold({ template: 'complete', database: 'sqlite', auth: true });
    const sources = files.filter(([rel]) => rel.endsWith('.ts')).map(([, text]) => text).join('\n');
    expect(sources).toContain("requireSecret('JWT_SECRET')");
  }, TIMEOUT);

  it('writes a freshly generated JWT_SECRET into .env, and a different one each time', async () => {
    const read = async () => {
      const files = await scaffold({ template: 'complete', database: 'sqlite', auth: true });
      const env = files.find(([rel]) => rel === '.env');
      expect(env, '.env should be generated').toBeDefined();
      return /^JWT_SECRET=(.*)$/m.exec(env![1])?.[1] ?? '';
    };

    const first = await read();
    const second = await read();

    expect(Buffer.byteLength(first, 'utf8')).toBeGreaterThanOrEqual(MIN_SECRET_BYTES);
    expect(WEAK).not.toContain(first);
    // If this ever fails, someone replaced the generator with another literal.
    expect(first).not.toEqual(second);
  }, TIMEOUT);

  it('leaves JWT_SECRET blank in .env.example rather than shipping a value', async () => {
    const files = await scaffold({ template: 'complete', database: 'sqlite', auth: true });
    const example = files.find(([rel]) => rel === '.env.example');
    expect(example, '.env.example should be generated').toBeDefined();
    expect(example![1]).toMatch(/^JWT_SECRET=\s*$/m);
  }, TIMEOUT);
});
