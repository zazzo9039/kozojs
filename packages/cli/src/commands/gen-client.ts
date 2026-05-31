import pc from 'picocolors';
import fs from 'fs-extra';
import path from 'node:path';
import { generateKozoTypes, resolveBuildApp } from '../kozo/types.js';

export async function genClientCommand(opts: {
  out?: string;
  baseUrl?: string;
}): Promise<void> {
  const cwd = process.cwd();
  await generateKozoTypes(cwd);

  const buildApp = await resolveBuildApp(cwd);
  if (!buildApp) {
    console.error(pc.red('Could not find kozo.config.ts or src/app.ts with buildApp()'));
    process.exit(1);
  }

  const app = await buildApp() as { generateClient: (o: object) => string };
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
