import fs from 'fs-extra';
import path from 'node:path';

export async function scaffoldApiOnlyTemplate(
  projectDir: string,
  projectName: string,
  kozoCoreDep: string,
  runtime: 'node' | 'cloudflare' | 'bun'
): Promise<void> {
  await fs.ensureDir(path.join(projectDir, 'src'));

  const packageJson = {
    name: projectName,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: runtime === 'bun' ? 'bun --watch src/index.ts' : 'tsx watch src/index.ts',
      build: 'tsc',
      start: runtime === 'bun' ? 'bun src/index.ts' : 'node dist/index.js',
    },
    dependencies: {
      '@kozojs/core': kozoCoreDep,
      hono: '^4.12.5',
      zod: '^4.0.0',
      ...(runtime === 'node' && { '@hono/node-server': '^1.19.10' }),
      ...(runtime === 'node' && { 'uWebSockets.js': 'github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df' }),
    },
    devDependencies: {
      '@types/node': '^22.0.0',
      ...(runtime !== 'bun' && { tsx: '^4.21.0' }),
      typescript: '^5.6.0',
    }
  };
  await fs.writeJSON(path.join(projectDir, 'package.json'), packageJson, { spaces: 2 });

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
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  };
  await fs.writeJSON(path.join(projectDir, 'tsconfig.json'), tsconfig, { spaces: 2 });

  const indexTs = `import { createKozo } from '@kozojs/core';
import { z } from 'zod';

const app = createKozo();

// Health check
app.get('/health', {}, () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

// Example endpoint with validation
app.get('/hello/:name', {
  params: z.object({ name: z.string() }),
  response: z.object({ message: z.string() }),
}, (c) => ({
  message: \`Hello, \${c.params.name}!\`,
}));

console.log('🔥 Kozo running on http://localhost:3000');
await app.nativeListen(3000);
`;
  await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), indexTs);

  await fs.writeFile(path.join(projectDir, '.gitignore'), 'node_modules/\ndist/\n.env\n');
}

// ============================================
// DOCKER & GITHUB ACTIONS
// ============================================

export async function createDockerCompose(
  dir: string,
  projectName: string,
  database: 'postgresql' | 'mysql' | 'sqlite' | 'none',
  dbPort?: number,
  includeApiService = false,
  runtime: 'node' | 'cloudflare' | 'bun' = 'node',
): Promise<void> {
  if (database === 'none' || database === 'sqlite') return;

  const pgPort = dbPort ?? 5436;

  let services = '';

  if (database === 'postgresql') {
    const dbUrl = `postgresql://postgres:postgres@db:5432/${projectName}`;
    services += `  db:
    image: postgres:16-alpine
    restart: unless-stopped
    ports:
      - "${pgPort}:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${projectName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5\n`;

    if (includeApiService) {
      const runCmd = runtime === 'bun' ? 'bun dist/index.js' : 'node dist/index.js';
      services += `\n  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${dbUrl}
      # No default on purpose: compose refuses to start the stack without it.
      JWT_SECRET: \${JWT_SECRET:?required - set JWT_SECRET in .env or the shell, at least 32 bytes}
    depends_on:
      db:
        condition: service_healthy
    command: ${runCmd}\n`;
    }
  } else if (database === 'mysql') {
    const dbUrl = `mysql://root:root@db:3306/${projectName}`;
    services += `  db:
    image: mysql:8-alpine
    restart: unless-stopped
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: ${projectName}
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 5\n`;

    if (includeApiService) {
      const runCmd = runtime === 'bun' ? 'bun dist/index.js' : 'node dist/index.js';
      services += `\n  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${dbUrl}
      # No default on purpose: compose refuses to start the stack without it.
      JWT_SECRET: \${JWT_SECRET:?required - set JWT_SECRET in .env or the shell, at least 32 bytes}
    depends_on:
      db:
        condition: service_healthy
    command: ${runCmd}\n`;
    }
  }

  const volumes = database === 'postgresql'
    ? '\nvolumes:\n  postgres_data:\n'
    : database === 'mysql'
    ? '\nvolumes:\n  mysql_data:\n'
    : '';

  const compose = `services:\n${services}${volumes}`;
  await fs.writeFile(path.join(dir, 'docker-compose.yml'), compose);
}

export async function createDockerfile(
  projectDir: string,
  runtime: 'node' | 'cloudflare' | 'bun',
): Promise<void> {
  const dockerfile = runtime === 'bun' 
    ? `FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["bun", "dist/index.js"]
`
    : `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
CMD ["node", "dist/index.js"]
`;
  await fs.writeFile(path.join(projectDir, 'Dockerfile'), dockerfile);
  await fs.writeFile(path.join(projectDir, '.dockerignore'), 'node_modules\ndist\n.git\n.env\n');
}

export async function createGitHubActions(projectDir: string): Promise<void> {
  await fs.ensureDir(path.join(projectDir, '.github', 'workflows'));
  
  const workflow = `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm test --if-present
`;
  await fs.writeFile(path.join(projectDir, '.github', 'workflows', 'ci.yml'), workflow);
}

// ============================================
// FULLSTACK PROJECT (Monorepo)
// ============================================

