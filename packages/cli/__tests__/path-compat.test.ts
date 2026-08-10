import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { checkArchitecture } from '../src/architecture/check.js';
import { writeFeatureFiles } from '../src/utils/scaffold/generators/feature.js';
import { normalizeRouteFilePath } from '../src/routing/scan.js';

const roots: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.remove(root))));

describe('CLI path compatibility (Windows \\ vs POSIX /)', () => {
  it('normalizes mixed separators for route discovery and manifests', () => {
    expect(normalizeRouteFilePath('src\\modules\\users\\users.routes.ts')).toBe(
      'src/modules/users/users.routes.ts',
    );
    expect(normalizeRouteFilePath('src/modules/users/users.routes.ts')).toBe(
      'src/modules/users/users.routes.ts',
    );
    expect(normalizeRouteFilePath('src\\modules/users/get.ts')).toBe('src/modules/users/get.ts');
  });

  it('scaffolds a feature when cwd is resolved with POSIX-style separators', async () => {
    const root = await tempRoot('kozo-path-posix-');
    const posixCwd = root.split(path.sep).join('/');
    const files = await writeFeatureFiles('devices', { cwd: posixCwd });

    expect(files.every((file) => !file.path.includes('\\'))).toBe(true);
    expect(await fs.pathExists(path.join(root, 'src', 'modules', 'devices', 'devices.routes.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(root, 'src', 'modules', 'index.ts'))).toBe(true);
  });

  it('scaffolds a feature when cwd uses native separators (including Windows \\)', async () => {
    const root = await tempRoot('kozo-path-native-');
    await writeFeatureFiles('trips', { cwd: root, crud: true });

    const nativeFile = path.join(root, 'src', 'modules', 'trips', 'trips.contract.ts');
    const mixedSeparators = [root, 'src/modules/trips/trips.contract.ts'].join(path.sep);
    expect(await fs.pathExists(nativeFile)).toBe(true);
    expect(await fs.pathExists(path.normalize(mixedSeparators))).toBe(true);
  });

  it('discovers architecture findings when --root uses forward slashes', async () => {
    const root = await tempRoot('kozo-check-posix-');
    await fs.writeJSON(path.join(root, 'package.json'), { scripts: { typecheck: 'tsc', test: 'vitest' } });
    await fs.outputFile(
      path.join(root, 'src', 'modules', 'users', 'users.contract.ts'),
      "import { z } from '@kozojs/core';\nexport const Bad = z.any();\nexport const When = z.date();\n",
    );

    const posixRoot = root.split(path.sep).join('/');
    const report = await checkArchitecture({ cwd: posixRoot });

    expect(report.filesChecked).toBeGreaterThan(0);
    expect(report.findings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['KOZO_ARCH003', 'KOZO_ARCH104']),
    );
    expect(report.findings.every((item) => item.line > 0)).toBe(true);
  });

  it('discovers the same contract findings with a native-separator root', async () => {
    const root = await tempRoot('kozo-check-native-');
    await fs.writeJSON(path.join(root, 'package.json'), { scripts: { typecheck: 'tsc', test: 'vitest' } });
    await fs.outputFile(
      path.join(root, 'src', 'modules', 'billing', 'billing.contract.ts'),
      "import { z } from '@kozojs/core';\nexport const Payload = z.object({ at: z.date() });\n",
    );
    await fs.outputFile(
      path.join(root, 'src', 'modules', 'billing', 'billing.routes.ts'),
      "import { db } from 'drizzle-orm';\nexport const billingRoutes = createRouter<AppServices>();\n",
    );

    const report = await checkArchitecture({ cwd: root });
    expect(report.findings.map((item) => item.code)).toEqual(
      expect.arrayContaining(['KOZO_ARCH001', 'KOZO_ARCH104']),
    );

    // Deep-import detection must treat Windows and POSIX module paths equivalently.
    await fs.outputFile(
      path.join(root, 'src', 'modules', 'billing', 'private.ts'),
      "import { secret } from '../users/private.js';\n",
    );
    await fs.outputFile(
      path.join(root, 'src', 'modules', 'users', 'private.ts'),
      'export const secret = 1;\n',
    );
    const deep = await checkArchitecture({ cwd: root });
    expect(deep.findings.some((item) => item.code === 'KOZO_ARCH004')).toBe(true);
  });
});
