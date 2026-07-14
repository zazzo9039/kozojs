import fs from 'fs-extra';
import path from 'node:path';
import type { ScaffoldOptions } from './types.js';
import { scaffoldCompleteTemplate, getDatabaseSchema, getDatabaseIndex, getSQLiteSeed, createExampleRoutes } from './template-complete.js';
import { scaffoldApiOnlyTemplate, createDockerCompose, createDockerfile, createGitHubActions } from './template-api-only.js';
import { scaffoldFullstackProject } from './fullstack-api.js';

export type { ScaffoldOptions } from './types.js';

export async function scaffoldProject(options: ScaffoldOptions): Promise<void> {
  const { projectName, runtime, database, dbPort, auth, packageSource, template, frontend, ssr, extras } = options;
  const projectDir = path.resolve(process.cwd(), projectName);

  // Determine @kozo/core version based on source
  const kozoCoreDep = packageSource === 'local'
    ? 'workspace:*'
    : '^0.5.21';

  // Handle fullstack with frontend FIRST (has priority over template type)
  if (frontend !== 'none') {
    await scaffoldFullstackProject(projectDir, projectName, kozoCoreDep, runtime, database, dbPort, auth, frontend, extras, template, ssr);
    return;
  }

  // Handle 'complete' template
  if (template === 'complete') {
    await scaffoldCompleteTemplate(projectDir, projectName, kozoCoreDep, runtime, database, dbPort, auth);
    // Always generate docker-compose for local DB dev when hasDb
    if (database !== 'none' && database !== 'sqlite') await createDockerCompose(projectDir, projectName, database, dbPort);
    if (extras.includes('docker')) await createDockerfile(projectDir, runtime);
    if (extras.includes('github-actions')) await createGitHubActions(projectDir);
    return;
  }

  // Handle 'api-only' template (minimal, no database)
  if (template === 'api-only') {
    await scaffoldApiOnlyTemplate(projectDir, projectName, kozoCoreDep, runtime);
    if (extras.includes('docker')) await createDockerfile(projectDir, runtime);
    if (extras.includes('github-actions')) await createGitHubActions(projectDir);
    return;
  }

  // Create directory structure
  await fs.ensureDir(path.join(projectDir, 'src', 'routes'));
  await fs.ensureDir(path.join(projectDir, 'src', 'db'));
  await fs.ensureDir(path.join(projectDir, 'src', 'services'));

  // Create package.json
  const packageJson = {
    name: projectName,
    version: '0.1.0',
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      'db:generate': 'drizzle-kit generate',
      'db:push': 'drizzle-kit push',
      'db:studio': 'drizzle-kit studio'
    },
    dependencies: {
      '@kozojs/core': kozoCoreDep,
      'uWebSockets.js': 'github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df',
      hono: '^4.12.5',
      zod: '^4.0.0',
      'drizzle-orm': '^0.36.0',
      ...(database === 'postgresql' && { postgres: '^3.4.8' }),
      ...(database === 'mysql' && { mysql2: '^3.11.0' }),
      ...(database === 'sqlite' && { 'better-sqlite3': '^11.0.0' })
    },
    devDependencies: {
      '@types/node': '^22.0.0',
      tsx: '^4.21.0',
      typescript: '^5.6.0',
      'drizzle-kit': '^0.28.0',
      ...(database === 'sqlite' && { '@types/better-sqlite3': '^7.6.0' })
    }
  };
  await fs.writeJSON(path.join(projectDir, 'package.json'), packageJson, { spaces: 2 });

  // Create tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: 'dist',
      rootDir: 'src',
      declaration: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  };
  await fs.writeJSON(path.join(projectDir, 'tsconfig.json'), tsconfig, { spaces: 2 });

  // Create drizzle.config.ts
  const drizzleConfig = `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${database === 'postgresql' ? 'postgresql' : database === 'mysql' ? 'mysql' : 'sqlite'}',
  dbCredentials: {
    ${database === 'sqlite' ? "url: './data.db'" : "url: process.env.DATABASE_URL!"}
  }
});
`;
  await fs.writeFile(path.join(projectDir, 'drizzle.config.ts'), drizzleConfig);

  // Create .env.example
  const envExample = `# Database
${database === 'sqlite' ? '# SQLite uses local file, no URL needed' : 'DATABASE_URL='}

# Server
PORT=3000
`;
  await fs.writeFile(path.join(projectDir, '.env.example'), envExample);

  // Create .gitignore
  const gitignore = `node_modules/
dist/
.env
*.db
.turbo/
`;
  await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore);

  // Create src/index.ts (entry point)
  const indexTs = `import { createKozo } from '@kozojs/core';
import { services } from './services/index.js';

const app = createKozo({
  services,
  port: Number(process.env.PORT) || 3000,
  openapi: {
    info: {
      title: '${projectName} API',
      version: '1.0.0',
      description: 'API documentation for ${projectName}'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ]
  }
});

await app.nativeListen();
`;
  await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), indexTs);

  // Create src/services/index.ts
  const servicesTs = `import { db } from '../db/index.js';

export const services = {
  db
};

// Type augmentation for autocomplete
declare module '@kozojs/core' {
  interface Services {
    db: typeof db;
  }
}
`;
  await fs.writeFile(path.join(projectDir, 'src', 'services', 'index.ts'), servicesTs);

  // Create src/db/schema.ts
  const schemaTs = getDatabaseSchema(database);
  await fs.writeFile(path.join(projectDir, 'src', 'db', 'schema.ts'), schemaTs);

  // Create src/db/index.ts
  const dbIndexTs = getDatabaseIndex(database);
  await fs.writeFile(path.join(projectDir, 'src', 'db', 'index.ts'), dbIndexTs);

  // Create src/db/seed.ts (for SQLite initialization)
  if (database === 'sqlite') {
    const seedTs = getSQLiteSeed();
    await fs.writeFile(path.join(projectDir, 'src', 'db', 'seed.ts'), seedTs);
  }

  // Create example routes
  await createExampleRoutes(projectDir);

  // Create README.md
  const readme = `# ${projectName}

Built with 🔥 **Kozo Framework**

## Getting Started

\`\`\`bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
\`\`\`

The server will start at http://localhost:3000

## Try the API

\`\`\`bash
# Get all users
curl http://localhost:3000/users

# Create a new user
curl -X POST http://localhost:3000/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Alice","email":"alice@example.com"}'

# Health check
curl http://localhost:3000

# Open Swagger UI
open http://localhost:3000/swagger
\`\`\`

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:3000/swagger
- **OpenAPI JSON**: http://localhost:3000/doc

## Project Structure

\`\`\`
src/
├── db/
│   ├── schema.ts    # Drizzle schema
│   ├── seed.ts      # Database initialization${database === 'sqlite' ? ' (SQLite)' : ''}
│   └── index.ts     # Database client
├── routes/
│   ├── index.ts     # GET /
│   └── users/
│       ├── get.ts   # GET /users
│       └── post.ts  # POST /users
├── services/
│   └── index.ts     # Service definitions
└── index.ts         # Entry point
\`\`\`

## Database Commands

\`\`\`bash
pnpm db:generate  # Generate migrations
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
\`\`\`

${database === 'sqlite' ? '## SQLite Notes\n\nThe database is automatically initialized with example data on first run.\nDatabase file: \`./data.db\`\n' : ''}
## Documentation

- [Kozo Docs](https://kozo-docs.vercel.app)
- [Drizzle ORM](https://orm.drizzle.team)
- [Hono](https://hono.dev)
`;
  await fs.writeFile(path.join(projectDir, 'README.md'), readme);

  // Always generate docker-compose for local DB dev when hasDb (non-sqlite)
  if (database !== 'none' && database !== 'sqlite') await createDockerCompose(projectDir, projectName, database, dbPort);
  if (extras.includes('docker')) await createDockerfile(projectDir, runtime);
  if (extras.includes('github-actions')) await createGitHubActions(projectDir);
}

