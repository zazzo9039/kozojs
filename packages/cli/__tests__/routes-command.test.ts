import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

import { routesCommand } from '../src/commands/routes.js';

async function writeRoute(routesDir: string, relativePath: string, content?: string): Promise<void> {
  const filePath = path.join(routesDir, relativePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(
    filePath,
    content ?? 'export default () => ({ ok: true });',
    'utf8',
  );
}

describe('routesCommand', () => {
  let projectRoot: string;
  let routesDir: string;
  let prevCwd: string;
  let logs: string[];

  beforeEach(async () => {
    prevCwd = process.cwd();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-routes-cmd-'));
    routesDir = path.join(projectRoot, 'src', 'routes');
    await fs.ensureDir(routesDir);
    process.chdir(projectRoot);
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.remove(projectRoot);
    vi.restoreAllMocks();
  });

  it('prints discovered routes with auth meta hints', async () => {
    await writeRoute(routesDir, 'health/get.ts', 'export const meta = { auth: false }; export default () => ({ ok: true });');
    await writeRoute(routesDir, 'users/get.ts', 'export const meta = { auth: true }; export default () => ({ ok: true });');
    await writeRoute(routesDir, 'posts/get.ts');

    await routesCommand({});

    const output = logs.join('\n');
    expect(output).toContain('Routes (3)');
    expect(output).toContain('/health');
    expect(output).toContain('public');
    expect(output).toContain('required');
    expect(output).toContain('jwt*');
  });

  it('accepts custom --routes-dir', async () => {
    const customDir = path.join(projectRoot, 'routes');
    await fs.ensureDir(customDir);
    await writeRoute(customDir, 'ping/get.ts');

    await routesCommand({ routesDir: 'routes' });

    expect(logs.join('\n')).toContain('/ping');
  });
});
