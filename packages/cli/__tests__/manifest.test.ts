import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

import { generateManifest, MANIFEST_VERSION } from '../src/routing/manifest.js';

async function writeRoute(routesDir: string, relativePath: string): Promise<void> {
  const filePath = path.join(routesDir, relativePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, 'export default () => ({ ok: true });', 'utf8');
}

describe('generateManifest', () => {
  let projectRoot: string;
  let routesDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-manifest-'));
    routesDir = path.join(projectRoot, 'src', 'routes');
    manifestPath = path.join(projectRoot, '.kozo', 'routes-manifest.json');
    await fs.ensureDir(routesDir);
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  it('writes manifest with route entries and schema version', async () => {
    await writeRoute(routesDir, 'health/get.ts');
    await writeRoute(routesDir, 'users/[id]/get.ts');

    const manifest = await generateManifest({
      routesDir,
      projectRoot,
      outputPath: manifestPath,
      cache: false,
    });

    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.routes).toHaveLength(2);
    expect(manifest.routes.map((r) => r.path).sort()).toEqual(['/health', '/users/:id']);
    expect(await fs.pathExists(manifestPath)).toBe(true);
  });

  it('includes middleware entries in manifest', async () => {
    await writeRoute(routesDir, 'health/get.ts');
    const mwPath = path.join(routesDir, 'admin', '_middleware.ts');
    await fs.ensureDir(path.dirname(mwPath));
    await fs.writeFile(mwPath, 'export default async (c, next) => next();', 'utf8');

    const manifest = await generateManifest({
      routesDir,
      projectRoot,
      outputPath: manifestPath,
      cache: false,
    });

    expect(manifest.middleware).toHaveLength(1);
    expect(manifest.middleware[0].pathPrefix).toBe('/admin/*');
  });

  it('returns cached manifest when content hash is unchanged', async () => {
    await writeRoute(routesDir, 'health/get.ts');

    const first = await generateManifest({
      routesDir,
      projectRoot,
      outputPath: manifestPath,
      cache: true,
    });

    const second = await generateManifest({
      routesDir,
      projectRoot,
      outputPath: manifestPath,
      cache: true,
    });

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.generatedAt).toBe(first.generatedAt);
  });

  it('regenerates when a route file is added', async () => {
    await writeRoute(routesDir, 'health/get.ts');

    const first = await generateManifest({
      routesDir,
      projectRoot,
      outputPath: manifestPath,
      cache: true,
    });

    await writeRoute(routesDir, 'posts/get.ts');

    const second = await generateManifest({
      routesDir,
      projectRoot,
      outputPath: manifestPath,
      cache: true,
    });

    expect(second.routes).toHaveLength(2);
    expect(second.contentHash).not.toBe(first.contentHash);
  });
});
