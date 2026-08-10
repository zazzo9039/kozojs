import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { checkArchitecture } from '../src/architecture/check.js';

const roots: string[] = [];
async function fixture(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-check-'));
  roots.push(root);
  await fs.writeJSON(path.join(root, 'package.json'), { scripts: { typecheck: 'tsc', test: 'vitest' } });
  for (const [name, content] of Object.entries(files)) await fs.outputFile(path.join(root, name), content);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.remove(root))));

describe('kozo check', () => {
  it('reports critical dependency and contract anti-patterns with stable locations', async () => {
    const root = await fixture({
      'src/modules/users/users.routes.ts': "import { db } from 'drizzle-orm';\nconst routes = createRouter<AppServices>();\n",
      'src/modules/users/users.service.ts': "import type { KozoContext } from '@kozojs/core';\nprocess.env.SECRET;\n",
      'src/modules/users/users.contract.ts': "import { z } from '@kozojs/core';\nexport const Bad = z.any();\n",
      'src/modules/users/private.ts': "import { value } from '../admin/private.js';\n",
    });
    const report = await checkArchitecture({ cwd: root });
    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      'KOZO_ARCH001', 'KOZO_ARCH002', 'KOZO_ARCH003', 'KOZO_ARCH004', 'KOZO_ARCH005', 'KOZO_ARCH006',
    ]));
    expect(report.findings.every((item) => item.line > 0 && item.suggestion.length > 0)).toBe(true);
  });

  it('accepts the canonical feature boundaries', async () => {
    const root = await fixture({
      'src/config.ts': 'export const value = process.env.PORT;',
      'src/modules/users/users.contract.ts': "import { z } from '@kozojs/core'; export const User = z.object({ id: z.string() });",
      'src/modules/users/users.service.ts': 'export const service = { find: (id: string) => id };',
      'src/modules/users/users.routes.ts': "export const usersRoutes = createRouter<AppServices>().get('/', { response: { 200: User } }, handler);",
      'src/modules/users/index.ts': "export * from './users.routes.js';",
    });
    const report = await checkArchitecture({ cwd: root });
    expect(report.errors).toBe(0);
  });

  it('can run contract rules independently and emits JSON-safe data', async () => {
    const root = await fixture({ 'src/modules/users/users.contract.ts': 'const Body = z.any();' });
    const report = await checkArchitecture({ cwd: root, architecture: false, contracts: true });
    expect(report.findings).toHaveLength(1);
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('warns when a public contract uses z.date()', async () => {
    const root = await fixture({
      'src/modules/users/users.contract.ts':
        "import { z } from '@kozojs/core';\nexport const User = z.object({ createdAt: z.date() });\n",
    });
    const report = await checkArchitecture({ cwd: root, architecture: false, contracts: true });
    expect(report.findings).toEqual([expect.objectContaining({ code: 'KOZO_ARCH104', severity: 'warning' })]);
  });
});
