import pc from 'picocolors';
import fs from 'fs-extra';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function genClientCommand(opts: {
  out?: string;
  baseUrl?: string;
}): Promise<void> {
  const cwd = process.cwd();
  const appCandidates = ['src/app.ts', 'src/app.js', 'src/index.ts', 'src/index.js'];
  let appPath: string | null = null;

  for (const rel of appCandidates) {
    const full = path.join(cwd, rel);
    if (await fs.pathExists(full)) {
      appPath = full;
      break;
    }
  }

  if (!appPath) {
    console.error(pc.red('Could not find src/app.ts or src/index.ts'));
    console.error(pc.dim('Export buildApp() from src/app.ts for best results.'));
    process.exit(1);
  }

  let mod: any;
  try {
    mod = await import(pathToFileURL(appPath).href);
  } catch (err) {
    console.error(pc.red('Failed to import app module:'), (err as Error).message);
    process.exit(1);
  }

  const buildApp = mod.buildApp ?? mod.default;
  if (typeof buildApp !== 'function') {
    console.error(pc.red('Module must export buildApp() or default async factory'));
    process.exit(1);
  }

  const app = await buildApp();
  if (typeof app.generateClient !== 'function') {
    console.error(pc.red('App instance has no generateClient() — did you register routes?'));
    process.exit(1);
  }

  const outPath = path.resolve(cwd, opts.out ?? 'src/generated/client.ts');
  const source = app.generateClient({
    baseUrl: opts.baseUrl ?? 'http://localhost:3000',
    includeValidation: true,
  });

  await fs.ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, source, 'utf8');

  console.log(pc.green('✓ Generated typed client →'), path.relative(cwd, outPath));
}
