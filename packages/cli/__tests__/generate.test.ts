import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import { glob } from 'glob';

vi.mock('@clack/prompts', () => ({
  log: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  select: vi.fn().mockResolvedValue('get'),
  confirm: vi.fn().mockResolvedValue(true),
  isCancel: vi.fn().mockReturnValue(false),
  cancel: vi.fn(),
  text: vi.fn(),
}));

import * as p from '@clack/prompts';
import { generateCommand } from '../src/commands/generate.js';
import { generateFeatureFiles, writeFeatureFiles } from '../src/utils/scaffold/generators/feature.js';
import { repoRoot } from './helpers/repo-root.js';

const ROOT = repoRoot();

describe('generateCommand', () => {
  let cwd: string;
  let prevCwd: string;

  beforeEach(async () => {
    prevCwd = process.cwd();
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'kozo-gen-'));
    process.chdir(cwd);
    vi.mocked(p.select).mockResolvedValue('get');
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.remove(cwd);
    vi.clearAllMocks();
  });

  it('creates a GET route with KozoContext template', async () => {
    await generateCommand('route', 'users/profile');

    const filePath = path.join(cwd, 'src', 'routes', 'users', 'profile', 'get.ts');
    expect(await fs.pathExists(filePath)).toBe(true);

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('KozoContext');
    expect(content).not.toContain('HandlerContext');
  });

  it('creates POST route with schema template', async () => {
    vi.mocked(p.select).mockResolvedValue('post');

    await generateCommand('route', 'items');

    const filePath = path.join(cwd, 'src', 'routes', 'items', 'post.ts');
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('KozoContext<typeof schema>');
    expect(content).toContain('export const schema');
  });

  it('creates middleware file', async () => {
    await generateCommand('middleware', 'auth');

    const filePath = path.join(cwd, 'src', 'middleware', 'auth.ts');
    expect(await fs.pathExists(filePath)).toBe(true);
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('auth middleware');
  });

  it('creates directory middleware file', async () => {
    await generateCommand('dir-middleware', 'admin');

    const filePath = path.join(cwd, 'src', 'routes', 'admin', '_middleware.ts');
    expect(await fs.pathExists(filePath)).toBe(true);
  });

  it('creates service file with capitalized type name', async () => {
    await generateCommand('service', 'email');

    const filePath = path.join(cwd, 'src', 'services', 'email.ts');
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('EmailService');
    expect(content).toContain('emailService');
  });

  it('generates the deterministic five-file feature skeleton', async () => {
    const first = generateFeatureFiles('audit-log');
    const second = generateFeatureFiles('audit-log');
    expect(first).toEqual(second);
    expect(first.map((file) => file.path)).toEqual([
      'src/modules/audit-log/audit-log.contract.ts',
      'src/modules/audit-log/audit-log.service.ts',
      'src/modules/audit-log/audit-log.routes.ts',
      'src/modules/audit-log/audit-log.test.ts',
      'src/modules/audit-log/index.ts',
    ]);
    expect(first[2]?.content).toContain('auditLogRoutes');
    expect(first[2]?.content).toContain('createRouter<AppServices>()');
  });

  it('supports crud, repository, auth and dry-run without writes', async () => {
    const files = await writeFeatureFiles('users', {
      cwd,
      crud: true,
      repository: true,
      auth: true,
      dryRun: true,
    });
    expect(files).toHaveLength(6);
    expect(files.some((file) => file.path.endsWith('users.repository.ts'))).toBe(true);
    expect(files.find((file) => file.path.endsWith('users.routes.ts'))?.content).toContain(".patch('/:id'");
    expect(files.find((file) => file.path.endsWith('users.contract.ts'))?.content).toContain('AuthorizationHeadersSchema');
    expect(await fs.pathExists(path.join(cwd, 'src'))).toBe(false);
  });

  it('refuses overwrite unless force is explicit', async () => {
    await writeFeatureFiles('users', { cwd });
    await expect(writeFeatureFiles('users', { cwd })).rejects.toThrow('Refusing to overwrite');
    await expect(writeFeatureFiles('users', { cwd, force: true })).resolves.toHaveLength(5);
  });

  it('typechecks the full crud/repository/auth feature in a static app', async () => {
    await writeFeatureFiles('users', { cwd, crud: true, repository: true, auth: true });
    await fs.outputFile(path.join(cwd, 'src', 'services.ts'), `
import type { Services } from '@kozojs/core';
import { createMemoryUsersRepository, createUsersService, type UsersService } from './modules/users/index.js';
export interface AppServices extends Services { users: UsersService }
export const services: AppServices = { users: createUsersService(createMemoryUsersRepository()) };
`);
    await fs.outputFile(path.join(cwd, 'src', 'app.ts'), `
import { createKozo } from '@kozojs/core';
import { usersRoutes } from './modules/users/index.js';
import { services, type AppServices } from './services.js';
export const createApp = () => createKozo<AppServices>({ services }).mount('/users', usersRoutes);
`);
    const sourceFiles = await glob('src/**/*.ts', { cwd, absolute: true });
    const program = ts.createProgram({
      rootNames: sourceFiles,
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        baseUrl: ROOT,
        typeRoots: [path.join(ROOT, 'node_modules', '@types')],
        paths: {
          '@kozojs/core': ['packages/core/src/index.ts'],
          '@kozojs/testing': ['packages/testing/src/index.ts'],
          'vitest': ['node_modules/vitest/index.d.cts'],
          'vitest/globals': ['node_modules/vitest/globals.d.ts'],
        },
        types: ['node'],
      },
    });
    expect(ts.getPreEmitDiagnostics(program).map((item) =>
      ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([]);
  }, 30_000);
});
