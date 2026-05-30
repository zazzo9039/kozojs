import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';

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
});
