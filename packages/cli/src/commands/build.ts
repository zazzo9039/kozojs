import { execa } from 'execa';
import pc from 'picocolors';
import fs from 'fs-extra';
import path from 'node:path';
import { generateManifest } from '../routing/manifest.js';

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

function printBox(title: string): void {
  const width = 50;
  const pad = Math.max(0, Math.floor((width - title.length) / 2));
  const line = '─'.repeat(width);
  console.log(pc.cyan(`┌${line}┐`));
  console.log(pc.cyan('│') + ' '.repeat(pad) + pc.bold(title) + ' '.repeat(width - pad - title.length) + pc.cyan('│'));
  console.log(pc.cyan(`└${line}┘`));
  console.log();
}

function step(n: number, total: number, label: string): void {
  console.log(pc.dim(`[${n}/${total}]`) + ' ' + pc.cyan('→') + ' ' + label);
}

function ok(label: string): void {
  console.log(pc.green('  ✓') + ' ' + label);
}

function fail(label: string, err?: unknown): void {
  console.log(pc.red('  ✗') + ' ' + label);
  if (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(pc.dim('    ' + msg));
  }
}

// ---------------------------------------------------------------------------
// Build command
// ---------------------------------------------------------------------------

export interface BuildOptions {
  /** Skip routes-manifest.json generation */
  noManifest?: boolean;
  /** Force manifest regeneration even if content hash is unchanged */
  forceManifest?: boolean;
  /** Custom routes directory relative to project root (default: src/routes) */
  routesDir?: string;
  /** Custom manifest output path relative to project root */
  manifestOut?: string;
  /** Additional arguments forwarded to tsup */
  tsupArgs?: string[];
}

export async function buildCommand(options: BuildOptions = {}): Promise<void> {
  console.clear();
  printBox('Kozo Build');

  const cwd = process.cwd();
  const TOTAL_STEPS = options.noManifest ? 3 : 4;
  let currentStep = 0;

  // -------------------------------------------------------------------------
  // Step 1 — Verify project structure
  // -------------------------------------------------------------------------
  currentStep++;
  step(currentStep, TOTAL_STEPS, 'Checking project structure…');

  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    fail('No package.json found. Run this command inside a Kozo project.');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    fail('Dependencies not installed. Run `npm install` first.');
    process.exit(1);
  }

  ok('Project structure OK');

  // -------------------------------------------------------------------------
  // Step 2 — Clean previous build output
  // -------------------------------------------------------------------------
  currentStep++;
  step(currentStep, TOTAL_STEPS, 'Cleaning previous build…');

  try {
    await fs.remove(path.join(cwd, 'dist'));
    ok('dist/ cleaned');
  } catch (err) {
    fail('Failed to clean dist/', err);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 3 — Generate routes manifest (optional)
  // -------------------------------------------------------------------------
  if (!options.noManifest) {
    currentStep++;
    step(currentStep, TOTAL_STEPS, 'Generating routes manifest…');

    const routesDirRel = options.routesDir ?? 'src/routes';
    const routesDirAbs = path.join(cwd, routesDirRel);

    if (!fs.existsSync(routesDirAbs)) {
      // Routes directory doesn't exist — skip silently
      console.log(pc.dim(`  ⚠  Routes directory not found (${routesDirRel}), skipping manifest.`));
    } else {
      try {
        const manifestOutAbs = options.manifestOut
          ? path.join(cwd, options.manifestOut)
          : path.join(cwd, 'routes-manifest.json');

        const manifest = await generateManifest({
          routesDir: routesDirAbs,
          projectRoot: cwd,
          outputPath: manifestOutAbs,
          cache: !options.forceManifest,
          verbose: true,
        });

        ok(`Manifest ready — ${manifest.routes.length} route(s)`);
      } catch (err) {
        fail('Manifest generation failed', err);
        // Non-fatal: continue to tsup compilation
        console.log(pc.dim('  Continuing build without manifest…'));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 4 — Compile with tsup
  // -------------------------------------------------------------------------
  currentStep++;
  step(currentStep, TOTAL_STEPS, 'Compiling with tsup…');

  try {
    const tsupArgs = ['tsup', ...(options.tsupArgs ?? [])];

    await execa('npx', tsupArgs, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    ok('Compilation complete');
  } catch (err) {
    fail('tsup compilation failed', err);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log();
  console.log(pc.green('✅  Build successful'));
  console.log();
}
