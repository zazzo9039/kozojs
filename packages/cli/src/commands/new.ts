import * as p from '@clack/prompts';
import pc from 'picocolors';
import { execa } from 'execa';
import { scaffoldProject, type ScaffoldOptions } from '../utils/scaffold.js';
import { printLogo } from '../utils/ascii-art.js';

export async function newCommand(projectName?: string): Promise<void> {
  printLogo();
  
  p.intro(pc.bold(pc.red('🔥 Create a new Kozo project')));

  // Auto-detect if running from local monorepo (dev mode)
  const isLocalWorkspace = process.env.KOZO_LOCAL === 'true';

  const project = await p.group(
    {
      name: () => {
        if (projectName) {
          if (!/^[a-z0-9-]+$/.test(projectName)) {
            p.log.error('Project name must use lowercase letters, numbers, and hyphens only');
            process.exit(1);
          }
          return Promise.resolve(projectName);
        }

        return p.text({
          message: 'Project name',
          placeholder: 'my-kozo-app',
          validate: (value) => {
            if (!value) return 'Project name is required';
            if (!/^[a-z0-9-]+$/.test(value)) return 'Use lowercase letters, numbers, and hyphens only';
          }
        });
      },

      runtime: () => p.select({
        message: 'Target runtime',
        options: [
          { value: 'node', label: 'Node.js / Docker', hint: 'Maximum compatibility (default)' },
          { value: 'cloudflare', label: 'Cloudflare Workers', hint: 'Edge-native, global deployment' },
          { value: 'bun', label: 'Bun', hint: 'Maximum local speed' },
        ],
        initialValue: 'node'
      }),

      template: () => p.select({
        message: 'Template',
        options: [
          { value: 'complete', label: 'Complete Server', hint: 'Full production-ready app (Auth, CRUD, Stats)' },
          { value: 'starter', label: 'Starter', hint: 'Minimal setup with database' },
          { value: 'api-only', label: 'API Only', hint: 'Minimal, no database' },
        ]
      }),

      database: ({ results }: any) => {
        if (results.template === 'api-only') {
          return Promise.resolve('none');
        }

        return p.select({
          message: 'Database',
          options: [
            { value: 'postgresql', label: 'PostgreSQL + Drizzle', hint: 'Standard — recommended for production' },
            { value: 'mysql', label: 'MySQL + Drizzle', hint: 'PlanetScale compatible' },
            { value: 'sqlite', label: 'SQLite + Drizzle', hint: 'Zero setup, great for local dev' },
            { value: 'none', label: 'None', hint: 'In-memory store (demo only)' },
          ]
        });
      },

      dbPort: ({ results }: any) => {
        if (results.database !== 'postgresql') return Promise.resolve(undefined);
        return p.text({
          message: 'PostgreSQL port',
          placeholder: '5436',
          initialValue: '5436',
          validate: (v) => (v && isNaN(Number(v)) ? 'Must be a valid port number' : undefined),
        });
      },

      auth: ({ results }: any) => {
        if (results.template === 'api-only') return Promise.resolve(false);
        return p.confirm({
          message: 'Include JWT authentication?',
          initialValue: true,
        });
      },

      frontend: () => p.select({
        message: 'Frontend',
        options: [
          { value: 'none', label: 'None (API only)', hint: 'Backend microservice' },
          { value: 'react', label: 'React (Vite + TanStack Query)', hint: 'Full-stack type-safe' },
          { value: 'solid', label: 'SolidJS (Vite)', hint: 'Performance purist choice' },
          { value: 'vue', label: 'Vue (Vite)', hint: 'Progressive framework' },
        ],
        initialValue: 'none'
      }),

      ssr: ({ results }: any) => {
        if (results.frontend === 'none') return Promise.resolve(false);
        return p.confirm({
          message: 'Enable Server-Side Rendering (SSR)?',
          active: 'Yes — unified server (API + SSR via listenSsr)',
          inactive: 'No — SPA + API separate (Vite dev server + API)',
          initialValue: false,
        });
      },

      extras: () => p.multiselect({
        message: 'Extras',
        options: [
          { value: 'docker', label: 'Docker', hint: 'Multi-stage Dockerfile' },
          { value: 'github-actions', label: 'GitHub Actions', hint: 'CI/CD pipeline' },
        ],
        required: false,
      }),

      install: () => Promise.resolve(true)
    },
    {
      onCancel: () => {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
    }
  );

  const s = p.spinner();

  // Scaffold project
  s.start('Creating project structure...');
  
  try {
    await scaffoldProject({
      projectName: project.name as string,
      runtime: project.runtime as ScaffoldOptions['runtime'],
      template: project.template as ScaffoldOptions['template'],
      database: (project.database ?? 'none') as ScaffoldOptions['database'],
      dbPort: project.dbPort ? Number(project.dbPort) : undefined,
      auth: project.auth as boolean,
      frontend: project.frontend as ScaffoldOptions['frontend'],
      ssr: project.ssr as boolean,
      extras: project.extras as ScaffoldOptions['extras'],
      packageSource: isLocalWorkspace ? 'local' : 'npm',
    });
    s.stop('Project structure created!');
  } catch (err) {
    s.stop('Failed to create project');
    p.log.error(String(err));
    process.exit(1);
  }

  // Install dependencies
  if (project.install) {
    s.start('Installing dependencies...');
    try {
      await execa('pnpm', ['install'], { 
        cwd: project.name as string,
        stdio: 'pipe'
      });
      s.stop('Dependencies installed!');
    } catch {
      // Try npm if pnpm fails
      try {
        await execa('npm', ['install'], { 
          cwd: project.name as string,
          stdio: 'pipe'
        });
        s.stop('Dependencies installed!');
      } catch {
        s.stop('Failed to install dependencies');
        p.log.warn('Run `pnpm install` or `npm install` manually');
      }
    }
  }

  // Success message
  p.outro(pc.green('✨ Project ready!'));

  console.log(`
${pc.bold('Next steps:')}

  ${pc.cyan(`cd ${project.name}`)}
  ${!project.install ? pc.cyan('pnpm install') + '\n  ' : ''}${pc.cyan('pnpm dev')}

${pc.dim('Documentation:')} ${pc.underline('https://kozo-docs.vercel.app')}
`);
}
