import { Command } from 'commander';
import { newCommand } from './commands/new.js';
import { buildCommand } from './commands/build.js';
import { devCommand } from './commands/dev.js';
import { generateCommand } from './commands/generate.js';
import { routesCommand } from './commands/routes.js';
import { genClientCommand } from './commands/gen-client.js';
import { typesCommand } from './commands/types.js';
import { checkCommand } from './commands/check.js';
import { initFromTemplate, isTemplateName } from './commands/init-template.js';
import pkg from '../package.json';

const program = new Command();

program
  .name('kozo')
  .description('CLI to scaffold new Kozo Framework projects')
  .version(pkg.version);

// Main command - create new project (interactive or --template)
program
  .argument('[project-name]', 'Name of the project')
  .option('-t, --template <name>', `Starter template: ${['api-contract', 'minimal', 'file-routing', 'fullstack-ssr'].join(', ')}`)
  .option('--no-install', 'Skip pnpm install after scaffolding')
  .action(async (projectName?: string, opts?: { template?: string; install?: boolean }) => {
    if (opts?.template) {
      if (!projectName) {
        console.error('Project name is required with --template');
        process.exit(1);
      }
      if (!isTemplateName(opts.template)) {
        console.error(`Unknown template "${opts.template}". Use: api-contract, minimal, file-routing, fullstack-ssr`);
        process.exit(1);
      }
      await initFromTemplate(projectName, opts.template, opts.install !== false);
      return;
    }
    await newCommand(projectName);
  });

// Build command - compile project with optional manifest generation
program
  .command('build')
  .description('Build the project (generates routes manifest then compiles with tsup)')
  .option('--no-manifest', 'Skip routes-manifest.json generation')
  .option('--force-manifest', 'Force manifest regeneration even if routes are unchanged')
  .option('--routes-dir <dir>', 'Routes directory relative to project root', 'src/routes')
  .option('--manifest-out <path>', 'Output path for routes-manifest.json relative to project root')
  .allowUnknownOption()
  .action(async (opts, cmd) => {
    // Forward any unrecognised flags to tsup
    const tsupArgs = cmd.args.length > 0 ? cmd.args : undefined;
    await buildCommand({
      noManifest: opts.noManifest === false || opts.manifest === false,
      forceManifest: opts.forceManifest ?? false,
      routesDir: opts.routesDir,
      manifestOut: opts.manifestOut,
      tsupArgs,
    });
  });

// Dev command - start development server with hot reload
program
  .command('dev')
  .description('Start development server with hot reload and route watcher')
  .action(async () => {
    await devCommand();
  });

// Generate command - scaffold routes, middleware
program
  .command('generate [type] [name]')
  .alias('g')
  .description('Generate a production feature (recommended) or file-routing scaffold')
  .option('--crud', 'Include update and delete operations')
  .option('--repository', 'Add an injectable repository boundary')
  .option('--auth', 'Require an Authorization header in public contracts')
  .option('--dry-run', 'Print deterministic file contents without writing')
  .option('--force', 'Overwrite existing generated feature files')
  .option('--no-barrel', 'Do not update src/modules/index.ts')
  .action(async (type?: string, name?: string, opts?: { crud?: boolean; repository?: boolean; auth?: boolean; dryRun?: boolean; force?: boolean; barrel?: boolean }) => {
    await generateCommand(type ?? '', name, opts);
  });

// List discovered file-system routes
program
  .command('routes')
  .description('List routes from the file-system routes directory')
  .option('--routes-dir <dir>', 'Routes directory relative to project root')
  .action(async (opts: { routesDir?: string }) => {
    await routesCommand(opts);
  });

// Generate KozoServices types from kozo.config.ts
program
  .command('types')
  .description('Generate .kozo/types.d.ts from kozo.config.ts (typed route handlers)')
  .action(async () => {
    await typesCommand();
  });

// Generate typed API client from registered routes
program
  .command('check')
  .description('Check Kozo application architecture and public contracts')
  .option('--architecture', 'Run architecture dependency rules')
  .option('--contracts', 'Run public contract rules')
  .option('--json', 'Emit machine-readable findings')
  .option('--root <path>', 'Project root to inspect', '.')
  .action(async (opts: { architecture?: boolean; contracts?: boolean; json?: boolean; root?: string }) => {
    const selected = opts.architecture || opts.contracts;
    const report = await checkCommand({
      architecture: selected ? Boolean(opts.architecture) : true,
      contracts: selected ? Boolean(opts.contracts) : true,
      json: opts.json,
      cwd: opts.root,
    });
    if (report.errors > 0) process.exitCode = 1;
  });

program
  .command('gen:client')
  .description('Generate a typed API client (kozo.config.ts or src/app.ts with buildApp)')
  .option('-o, --out <path>', 'Output file path', 'src/generated/client.ts')
  .option('--base-url <url>', 'Base URL for the client', 'http://localhost:3000')
  .action(async (opts: { out?: string; baseUrl?: string }) => {
    await genClientCommand(opts);
  });

program.parse();

