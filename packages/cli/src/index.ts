import { Command } from 'commander';
import { newCommand } from './commands/new.js';
import { buildCommand } from './commands/build.js';
import { devCommand } from './commands/dev.js';
import { generateCommand } from './commands/generate.js';
import { routesCommand } from './commands/routes.js';
import { genClientCommand } from './commands/gen-client.js';
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
  .option('-t, --template <name>', `Starter template: ${['minimal', 'file-routing', 'fullstack-ssr'].join(', ')}`)
  .option('--no-install', 'Skip pnpm install after scaffolding')
  .action(async (projectName?: string, opts?: { template?: string; install?: boolean }) => {
    if (opts?.template) {
      if (!projectName) {
        console.error('Project name is required with --template');
        process.exit(1);
      }
      if (!isTemplateName(opts.template)) {
        console.error(`Unknown template "${opts.template}". Use: minimal, file-routing, fullstack-ssr`);
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
  .description('Generate scaffolding: route, middleware')
  .action(async (type?: string, name?: string) => {
    await generateCommand(type ?? '', name);
  });

// List discovered file-system routes
program
  .command('routes')
  .description('List routes from the file-system routes directory')
  .option('--routes-dir <dir>', 'Routes directory relative to project root')
  .action(async (opts: { routesDir?: string }) => {
    await routesCommand(opts);
  });

// Generate typed API client from registered routes
program
  .command('gen:client')
  .description('Generate a typed API client (requires export buildApp in src/app.ts)')
  .option('-o, --out <path>', 'Output file path', 'src/generated/client.ts')
  .option('--base-url <url>', 'Base URL for the client', 'http://localhost:3000')
  .action(async (opts: { out?: string; baseUrl?: string }) => {
    await genClientCommand(opts);
  });

program.parse();

