import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanMiddleware } from '../src/router.js';

const tempDirs: string[] = [];

async function makeRoutesDir(): Promise<string> {
  const dir = join(
    tmpdir(),
    `kozo-middleware-fail-closed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('directory middleware loading is fail-closed', () => {
  it('rejects startup when a middleware module cannot be imported', async () => {
    const routesDir = await makeRoutesDir();
    await writeFile(
      join(routesDir, '_middleware.js'),
      `throw new Error('middleware boom');\n`,
      'utf8',
    );

    await expect(scanMiddleware({ routesDir, verbose: false })).rejects.toThrow(
      /\[Kozo\] Failed to load middleware _middleware\.js: middleware boom/,
    );
  });
});
