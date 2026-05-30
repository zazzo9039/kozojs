import { spawn } from 'child_process';
import chokidar from 'chokidar';
import pc from 'picocolors';
import fs from 'fs-extra';
import path from 'path';
import { generateManifest } from '../routing/manifest.js';

// ---------------------------------------------------------------------------
// Dev command
// ---------------------------------------------------------------------------

export async function devCommand(): Promise<void> {
  console.clear();

  // 1. Header
  printBox('Kozo Development Server');

  // 2. Pre-flight checks
  await runStep(1, 4, 'Checking project structure...', async () => {
    if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
      throw new Error('No package.json found. Run this command in a Kozo project.');
    }
  });

  await runStep(2, 4, 'Checking dependencies...', async () => {
    if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
      throw new Error('Dependencies not installed. Run: pnpm install');
    }
    await sleep(300);
  });

  // 3. Detect routes directory
  const routesDir = resolveRoutesDir(process.cwd());

  await runStep(3, 4, 'Scanning routes...', async () => {
    if (routesDir) {
      await generateManifest({ routesDir, projectRoot: process.cwd(), cache: false, verbose: false });
    }
    await sleep(300);
  });

  await runStep(4, 4, 'Starting server on port 3000...', async () => {
    await sleep(200);
  });

  console.log(pc.gray('\nℹ  👀 Watching for file changes... (Ctrl+C to stop)\n'));
  console.log(pc.dim('─'.repeat(50)) + '\n');

  // 4. Start tsx watch process
  const child = spawn('npx', ['tsx', 'watch', 'src/index.ts'], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.on('error', (err) => {
    console.error(pc.red('\n❌ Failed to start server'));
    console.error(err);
    process.exit(1);
  });

  child.on('close', (code) => {
    if (code === 0 || code === null) {
      console.log('\n' + pc.dim('Server stopped'));
    }
    process.exit(code ?? 0);
  });

  // 5. Watch routes directory for hot manifest regeneration
  if (routesDir) {
    startRouteWatcher(routesDir);
  }

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n' + pc.yellow('⏹  Stopping Kozo dev server...'));
    child.kill('SIGTERM');
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Route watcher
// ---------------------------------------------------------------------------

/**
 * Start a chokidar watcher on `routesDir`.
 * On any add/change/unlink event:
 *   1. Regenerate the routes manifest (cache bypassed).
 *   2. Log '[Kozo] ✨ Routes updated (X found).' to stdout.
 *
 * The function is intentionally non-blocking — it returns immediately and
 * the watcher runs in the background for the lifetime of the process.
 */
export function startRouteWatcher(routesDir: string): chokidar.FSWatcher {
  // Debounce rapid bursts (e.g. editor saves multiple files at once)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = chokidar.watch(routesDir, {
    ignored: /(^|[/\\])\..|(\.test\.[tj]s$)|(\.spec\.[tj]s$)/,
    persistent: true,
    ignoreInitial: true,   // don't fire for files already present at startup
    awaitWriteFinish: {
      stabilityThreshold: 80,
      pollInterval: 50,
    },
  });

  const handleChange = (eventType: string, filePath: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      try {
        const manifest = await generateManifest({
          routesDir,
          projectRoot: process.cwd(),
          cache: false,   // always regenerate on file change
          verbose: false,
        });

        const count = manifest.routes.length;
        console.log(
          pc.cyan('[Kozo]') +
            ' ✨ Routes updated ' +
            pc.dim(`(${count} found)`) +
            pc.dim(` — ${path.relative(process.cwd(), filePath)}`)
        );
      } catch (err) {
        console.error(
          pc.red('[Kozo] ❌ Failed to regenerate routes manifest:'),
          (err as Error).message
        );
      }
    }, 120);
  };

  watcher
    .on('add',    (p) => handleChange('add', p))
    .on('change', (p) => handleChange('change', p))
    .on('unlink', (p) => handleChange('unlink', p))
    .on('error',  (err) => console.error(pc.red('[Kozo] Watcher error:'), err));

  return watcher;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the routes directory for the current project.
 * Checks common conventions in order:
 *   src/routes  →  routes  →  src/app/routes  →  app/routes
 */
export function resolveRoutesDir(cwd: string): string | null {
  const candidates = [
    path.join(cwd, 'src', 'routes'),
    path.join(cwd, 'routes'),
    path.join(cwd, 'src', 'app', 'routes'),
    path.join(cwd, 'app', 'routes'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

function printBox(title: string): void {
  const width = 50;
  const pad = Math.floor((width - title.length) / 2);
  const line = '─'.repeat(width);
  console.log(pc.cyan('┌' + line + '┐'));
  console.log(pc.cyan('│') + ' '.repeat(pad) + pc.bold(title) + ' '.repeat(width - pad - title.length) + pc.cyan('│'));
  console.log(pc.cyan('└' + line + '┘'));
  console.log();
}

async function runStep(
  step: number,
  total: number,
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  const prefix = pc.dim(`[${step}/${total}]`);
  process.stdout.write(`${prefix} ${label}`);
  try {
    await fn();
    process.stdout.write(' ' + pc.green('✓') + '\n');
  } catch (err) {
    process.stdout.write(' ' + pc.red('✗') + '\n');
    console.error(pc.red(`\n  Error: ${(err as Error).message}`));
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
