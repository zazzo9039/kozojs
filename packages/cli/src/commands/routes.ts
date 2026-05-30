import pc from 'picocolors';
import fs from 'fs-extra';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { scanRoutes } from '../routing/scan.js';
import { resolveRoutesDir } from '../commands/dev.js';

function readMeta(handlerPath: string): { auth?: boolean; tags?: string[] } | undefined {
  try {
    const src = readFileSync(handlerPath, 'utf8');
    const authFalse = /meta\s*=\s*\{[^}]*auth\s*:\s*false/.test(src);
    const authTrue = /meta\s*=\s*\{[^}]*auth\s*:\s*true/.test(src);
    const tagsMatch = src.match(/tags\s*:\s*\[([^\]]*)\]/);
    const tags = tagsMatch
      ? tagsMatch[1].split(',').map((t) => t.replace(/['"`\s]/g, '')).filter(Boolean)
      : undefined;
    return {
      auth: authFalse ? false : authTrue ? true : undefined,
      tags,
    };
  } catch {
    return undefined;
  }
}

export async function routesCommand(opts: { routesDir?: string }): Promise<void> {
  const cwd = process.cwd();
  const routesDir = opts.routesDir
    ? path.resolve(cwd, opts.routesDir)
    : resolveRoutesDir(cwd);

  if (!routesDir || !(await fs.pathExists(routesDir))) {
    console.error(pc.red('No routes directory found.'));
    console.error(pc.dim('Looked for src/routes, routes, src/app/routes, app/routes'));
    console.error(pc.dim('Or pass --routes-dir <path>'));
    process.exit(1);
  }

  const routes = await scanRoutes({ routesDir, verbose: false });
  if (routes.length === 0) {
    console.log(pc.yellow('No routes found in'), routesDir);
    return;
  }

  console.log(pc.bold(`Routes (${routes.length})`) + pc.dim(` — ${path.relative(cwd, routesDir)}`));
  console.log();

  const colMethod = 7;
  const colPath = 28;
  console.log(
    pc.dim('METHOD'.padEnd(colMethod)) +
    pc.dim('PATH'.padEnd(colPath)) +
    pc.dim('AUTH') +
    pc.dim('  FILE'),
  );

  for (const r of routes.sort((a, b) => a.path.localeCompare(b.path))) {
    const meta = readMeta(r.handler);
    const auth =
      meta?.auth === false ? pc.green('public') :
      meta?.auth === true ? pc.yellow('required') :
      pc.dim('jwt*');

    console.log(
      pc.cyan(r.method.toUpperCase().padEnd(colMethod)) +
      r.path.padEnd(colPath) +
      auth.padEnd(12) +
      pc.dim(r.relativePath),
    );
  }

  console.log();
  console.log(pc.dim('* default: JWT when registerAuthBeforeLoadRoutes is used'));
}
