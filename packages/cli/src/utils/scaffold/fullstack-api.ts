import fs from 'fs-extra';
import path from 'node:path';
import type { ScaffoldOptions } from './types.js';
import { getDatabaseSchema, getDatabaseIndex, getSQLiteSeed } from './template-complete.js';
import { createDockerCompose, createDockerfile, createGitHubActions } from './template-api-only.js';
import { scaffoldFullstackWeb, scaffoldFullstackReadme } from './fullstack-web.js';
import { ENV_SECRET_HELP, generateSecret } from '../secret.js';

export async function scaffoldFullstackProject(
  projectDir: string,
  projectName: string,
  kozoCoreDep: string,
  runtime: 'node' | 'cloudflare' | 'bun',
  database: 'postgresql' | 'mysql' | 'sqlite' | 'none',
  dbPort: number | undefined,
  auth: boolean,
  frontend: 'react' | 'solid' | 'vue',
  extras: ('docker' | 'github-actions')[],
  template: 'starter' | 'complete' | 'api-only',
  ssr: boolean = false,
): Promise<void> {
  const hasDb = database !== 'none';

  // Create monorepo structure
  await fs.ensureDir(path.join(projectDir, 'apps', 'api', 'src', 'routes'));
  await fs.ensureDir(path.join(projectDir, 'apps', 'api', 'src', 'data'));
  if (hasDb) await fs.ensureDir(path.join(projectDir, 'apps', 'api', 'src', 'db'));
  await fs.ensureDir(path.join(projectDir, 'apps', 'web', 'src', 'lib'));
  await fs.ensureDir(path.join(projectDir, '.vscode'));

  // Root package.json
  const rootPackageJson = {
    name: projectName,
    private: true,
    scripts: ssr
      ? {
          dev: `pnpm --filter @${projectName}/api dev`,
          build: 'pnpm run --recursive build',
        }
      : {
          dev: 'pnpm run --parallel dev',
          build: 'pnpm run --recursive build',
        },
  };
  await fs.writeJSON(path.join(projectDir, 'package.json'), rootPackageJson, { spaces: 2 });
  
  // pnpm-workspace.yaml
  await fs.writeFile(path.join(projectDir, 'pnpm-workspace.yaml'), `packages:\n  - 'apps/*'\n`);

  // .gitignore
  await fs.writeFile(path.join(projectDir, '.gitignore'), 'node_modules/\ndist/\n.env\n*.log\n');

  // ========== API ==========
  await scaffoldFullstackApi(projectDir, projectName, kozoCoreDep, runtime, database, dbPort, auth, ssr);

  // ========== WEB ==========
  await scaffoldFullstackWeb(projectDir, projectName, frontend, auth, ssr);

  // ========== README ==========
  await scaffoldFullstackReadme(projectDir, projectName);

  // ========== EXTRAS ==========
  // Always generate docker-compose at root for local DB dev when hasDb
  if (database !== 'none' && database !== 'sqlite') await createDockerCompose(projectDir, projectName, database, dbPort);
  if (extras.includes('docker')) await createDockerfile(path.join(projectDir, 'apps', 'api'), runtime);
  if (extras.includes('github-actions')) await createGitHubActions(projectDir);
}

async function scaffoldFullstackApi(
  projectDir: string,
  projectName: string,
  kozoCoreDep: string,
  runtime: 'node' | 'cloudflare' | 'bun',
  database: 'postgresql' | 'mysql' | 'sqlite' | 'none' = 'none',
  dbPort?: number,
  auth: boolean = true,
  ssr: boolean = false,
): Promise<void> {
  const apiDir = path.join(projectDir, 'apps', 'api');
  const hasDb = database !== 'none';

  // Create db directory if needed
  if (hasDb) {
    await fs.ensureDir(path.join(apiDir, 'src', 'db'));
    await fs.writeFile(path.join(apiDir, 'src', 'db', 'schema.ts'), getDatabaseSchema(database));
    await fs.writeFile(path.join(apiDir, 'src', 'db', 'index.ts'), getDatabaseIndex(database));
    if (database === 'sqlite') {
      await fs.writeFile(path.join(apiDir, 'src', 'db', 'seed.ts'), getSQLiteSeed());
    }
    // drizzle.config.ts
    const dialect = database === 'postgresql' ? 'postgresql' : database === 'mysql' ? 'mysql' : 'sqlite';
    const pgPort = dbPort ?? 5436;
    const dbUrl = database === 'postgresql'
      ? `postgresql://postgres:postgres@localhost:${pgPort}/${projectName}`
      : database === 'mysql'
      ? `mysql://root:root@localhost:3306/${projectName}`
      : undefined;
    await fs.writeFile(path.join(apiDir, 'drizzle.config.ts'), `import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${dialect}',
  dbCredentials: {
    ${database === 'sqlite' ? "url: './data.db'" : 'url: process.env.DATABASE_URL!'}
  },
});
`);
    // .env gets a secret minted on this machine; .env.example is committed by
    // the user, so it ships instructions and no value.
    const envContent = (jwtSecret: string) =>
      `PORT=3000\nNODE_ENV=development\n${dbUrl ? `DATABASE_URL=${dbUrl}\n` : ''}${auth ? `${ENV_SECRET_HELP}\nJWT_SECRET=${jwtSecret}\n` : ''}`;
    await fs.writeFile(path.join(apiDir, '.env'), envContent(auth ? generateSecret() : ''));
    await fs.writeFile(path.join(apiDir, '.env.example'), envContent(''));
  } else {
    const envContent = (jwtSecret: string) =>
      `PORT=3000\nNODE_ENV=development\n${auth ? `${ENV_SECRET_HELP}\nJWT_SECRET=${jwtSecret}\n` : ''}`;
    await fs.writeFile(path.join(apiDir, '.env'), envContent(auth ? generateSecret() : ''));
    await fs.writeFile(path.join(apiDir, '.env.example'), envContent(''));
  }

  // package.json
  const apiPackageJson = {
    name: `@${projectName}/api`,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: runtime === 'bun' ? 'bun --watch src/index.ts' : 'node --import tsx --watch-path=./src src/index.ts',
      build: 'tsc',
      ...(hasDb && {
        'db:generate': 'drizzle-kit generate',
        'db:push': 'drizzle-kit push',
        'db:studio': 'drizzle-kit studio',
      }),
    },
    dependencies: {
      '@kozojs/core': kozoCoreDep,
      ...(auth && { '@kozojs/auth': kozoCoreDep === 'workspace:*' ? 'workspace:*' : '^0.5.21' }),
      hono: '^4.12.5',
      zod: '^4.0.0',
      dotenv: '^16.4.0',
      ...(runtime === 'node' && { '@hono/node-server': '^1.19.10' }),
      ...(runtime === 'node' && { 'uWebSockets.js': 'github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df' }),
      ...(hasDb && { 'drizzle-orm': '^0.36.0' }),
      ...(database === 'postgresql' && { postgres: '^3.4.8' }),
      ...(database === 'mysql' && { mysql2: '^3.11.0' }),
      ...(database === 'sqlite' && { 'better-sqlite3': '^11.0.0' }),
    },
    devDependencies: {
      '@types/node': '^22.0.0',
      ...(runtime !== 'bun' && { tsx: '^4.21.0' }),
      typescript: '^5.6.0',
      ...(ssr && { vite: '^5.0.0', '@vitejs/plugin-react': '^4.7.0' }),
      ...(hasDb && { 'drizzle-kit': '^0.28.0' }),
      ...(database === 'sqlite' && { '@types/better-sqlite3': '^7.6.0' }),
    }
  };
  await fs.writeJSON(path.join(apiDir, 'package.json'), apiPackageJson, { spaces: 2 });

  // tsconfig.json
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
  await fs.writeJSON(path.join(apiDir, 'tsconfig.json'), tsconfig, { spaces: 2 });

  // src/index.ts
  // Note: fullstack template routes use in-memory data (src/data/index.ts).
  // The db/ files are scaffolded for future Drizzle usage but not wired into routes.
  const authImport = auth ? `import { jwtGuard } from '@kozojs/auth';\n` : '';
  const authMiddleware = auth
    ? `\n// JWT protects all /api/* routes except public ones.\n// app.guard runs on BOTH transports (listen + nativeListen) at native speed.\n// requireSecret has no fallback: a missing JWT_SECRET stops the boot.\nconst JWT_SECRET = requireSecret('JWT_SECRET');\napp.guard('/api/*', jwtGuard(JWT_SECRET, {\n  publicPaths: ['/api/auth', '/api/health', '/api/stats'],\n}));\n`
    : '';

  const listenCode = ssr
    ? `await app.listenSsr(PORT, {
  root: join(__dirname, '../../web'),
  entryServer: 'src/entry-server.tsx',
});`
    : runtime === 'node' ? 'await app.nativeListen();' : 'await app.listen();';

  await fs.outputFile(path.join(apiDir, 'src', 'index.ts'), `import 'dotenv/config';
import { createKozo${auth ? ', requireSecret' : ''} } from '@kozojs/core';
${authImport}import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const app = createKozo({
  port: PORT,
  openapi: {
    info: {
      title: '${projectName} API',
      version: '1.0.0',
      description: 'API documentation for ${projectName}',
    },
    servers: [{ url: \`http://localhost:\${PORT}\`, description: 'Development server' }],
  },
});
${authMiddleware}await app.loadRoutes(join(__dirname, 'routes'));

export type AppType = typeof app;

console.log(\`🔥 ${projectName} ${ssr ? 'SSR' : 'API'} on http://localhost:\${PORT}\`);
${listenCode}
`);

  // src/schemas/index.ts — shared Zod schemas (separate from data)
  await fs.outputFile(path.join(apiDir, 'src', 'schemas', 'index.ts'), `import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  createdAt: z.string().optional(),
});

export const CreateUserBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).optional(),
});

export const UpdateUserBody = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
});

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  authorId: z.string(),
  published: z.boolean(),
  createdAt: z.string().optional(),
});

export const CreatePostBody = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  authorId: z.string().optional(),
  published: z.boolean().optional(),
});

export const UpdatePostBody = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  published: z.boolean().optional(),
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  priority: z.enum(['low', 'medium', 'high']),
  createdAt: z.string(),
});

export const CreateTaskBody = z.object({
  title: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

export const UpdateTaskBody = z.object({
  title: z.string().optional(),
  completed: z.boolean().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});
`);

  // src/data/index.ts — in-memory data store (no schemas)
  await fs.outputFile(path.join(apiDir, 'src', 'data', 'index.ts'), `export const users = [
  { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' as const, createdAt: new Date().toISOString() },
  { id: '2', name: 'Bob', email: 'bob@example.com', role: 'user' as const, createdAt: new Date().toISOString() },
];

export const posts = [
  { id: '1', title: 'Hello World', content: 'First post!', authorId: '1', published: true, createdAt: new Date().toISOString() },
  { id: '2', title: 'Draft', content: 'Work in progress', authorId: '2', published: false, createdAt: new Date().toISOString() },
];

export const tasks = [
  { id: '1', title: 'Setup project', completed: true, priority: 'high' as const, createdAt: new Date().toISOString() },
  { id: '2', title: 'Write tests', completed: false, priority: 'medium' as const, createdAt: new Date().toISOString() },
  { id: '3', title: 'Deploy', completed: false, priority: 'low' as const, createdAt: new Date().toISOString() },
];
`);

  // FSR route files — one file per HTTP method, directory = URL path segment
  // routes/api/health/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'health', 'get.ts'), `import { z } from 'zod';

export const schema = {
  response: z.object({
    status: z.string(),
    timestamp: z.string(),
    version: z.string(),
    uptime: z.number(),
  }),
};

export default async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  uptime: process.uptime(),
});
`);

  // routes/api/stats/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'stats', 'get.ts'), `import { z } from 'zod';
import { users, posts, tasks } from '../../../data/index.js';

export const schema = {
  response: z.object({
    users: z.number(),
    posts: z.number(),
    tasks: z.number(),
    publishedPosts: z.number(),
    completedTasks: z.number(),
  }),
};

export default async () => ({
  users: users.length,
  posts: posts.length,
  tasks: tasks.length,
  publishedPosts: posts.filter(p => p.published).length,
  completedTasks: tasks.filter(t => t.completed).length,
});
`);

  // routes/api/echo/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'echo', 'get.ts'), `import { z } from 'zod';

export const schema = {
  query: z.object({ message: z.string() }),
  response: z.object({
    echo: z.string(),
    timestamp: z.string(),
  }),
};

export default async ({ query }: { query: { message: string } }) => ({
  echo: query.message,
  timestamp: new Date().toISOString(),
});
`);

  // routes/api/validate/post.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'validate', 'post.ts'), `import { z } from 'zod';

export const schema = {
  body: z.object({
    email: z.string().email(),
    age: z.number().min(0).max(150),
  }),
  response: z.object({
    valid: z.boolean(),
    data: z.object({ email: z.string(), age: z.number() }),
  }),
};

export default async ({ body }: { body: { email: string; age: number } }) => ({
  valid: true,
  data: body,
});
`);

  // routes/api/users/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'users', 'get.ts'), `import { z } from 'zod';
import { users } from '../../../data/index.js';
import { UserSchema } from '../../../schemas/index.js';

export const schema = {
  response: z.array(UserSchema),
};

export default async () => users;
`);

  // routes/api/users/post.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'users', 'post.ts'), `import { users } from '../../../data/index.js';
import { UserSchema, CreateUserBody } from '../../../schemas/index.js';

export const schema = {
  body: CreateUserBody,
  response: UserSchema,
};

export default async ({ body }: { body: { name: string; email: string; role?: 'admin' | 'user' } }) => {
  const newUser = {
    id: String(Date.now()),
    name: body.name,
    email: body.email,
    role: body.role ?? ('user' as const),
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  return newUser;
};
`);

  // routes/api/users/[id]/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'users', '[id]', 'get.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { users } from '../../../../data/index.js';
import { UserSchema } from '../../../../schemas/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  response: UserSchema,
};

export default async ({ params }: { params: { id: string } }) => {
  const user = users.find(u => u.id === params.id);
  if (!user) throw new KozoError('User not found', 404, 'NOT_FOUND');
  return user;
};
`);

  // routes/api/users/[id]/put.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'users', '[id]', 'put.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { users } from '../../../../data/index.js';
import { UserSchema, UpdateUserBody } from '../../../../schemas/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  body: UpdateUserBody,
  response: UserSchema,
};

export default async ({
  params,
  body,
}: {
  params: { id: string };
  body: { name?: string; email?: string; role?: 'admin' | 'user' };
}) => {
  const idx = users.findIndex(u => u.id === params.id);
  if (idx === -1) throw new KozoError('User not found', 404, 'NOT_FOUND');
  users[idx] = { ...users[idx], ...body };
  return users[idx];
};
`);

  // routes/api/users/[id]/delete.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'users', '[id]', 'delete.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { users } from '../../../../data/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  response: z.object({ success: z.boolean(), message: z.string() }),
};

export default async ({ params }: { params: { id: string } }) => {
  const idx = users.findIndex(u => u.id === params.id);
  if (idx === -1) throw new KozoError('User not found', 404, 'NOT_FOUND');
  users.splice(idx, 1);
  return { success: true, message: 'User deleted' };
};
`);

  // routes/api/posts/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'posts', 'get.ts'), `import { z } from 'zod';
import { posts } from '../../../data/index.js';
import { PostSchema } from '../../../schemas/index.js';

export const schema = {
  query: z.object({ published: z.coerce.boolean().optional() }),
  response: z.array(PostSchema),
};

export default async ({ query }: { query: { published?: boolean } }) => {
  if (query.published !== undefined) {
    return posts.filter(p => p.published === query.published);
  }
  return posts;
};
`);

  // routes/api/posts/post.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'posts', 'post.ts'), `import { posts, users } from '../../../data/index.js';
import { PostSchema, CreatePostBody } from '../../../schemas/index.js';

export const schema = {
  body: CreatePostBody,
  response: PostSchema,
};

export default async ({
  body,
}: {
  body: { title: string; content?: string; authorId?: string; published?: boolean };
}) => {
  const authorId = body.authorId ?? users[0]?.id ?? 'unknown';
  const newPost = {
    id: String(Date.now()),
    title: body.title,
    content: body.content ?? '',
    authorId,
    published: body.published ?? false,
    createdAt: new Date().toISOString(),
  };
  posts.push(newPost);
  return newPost;
};
`);

  // routes/api/posts/[id]/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'posts', '[id]', 'get.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { posts } from '../../../../data/index.js';
import { PostSchema } from '../../../../schemas/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  response: PostSchema,
};

export default async ({ params }: { params: { id: string } }) => {
  const post = posts.find(p => p.id === params.id);
  if (!post) throw new KozoError('Post not found', 404, 'NOT_FOUND');
  return post;
};
`);

  // routes/api/posts/[id]/put.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'posts', '[id]', 'put.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { posts } from '../../../../data/index.js';
import { PostSchema, UpdatePostBody } from '../../../../schemas/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  body: UpdatePostBody,
  response: PostSchema,
};

export default async ({
  params,
  body,
}: {
  params: { id: string };
  body: { title?: string; content?: string; published?: boolean };
}) => {
  const idx = posts.findIndex(p => p.id === params.id);
  if (idx === -1) throw new KozoError('Post not found', 404, 'NOT_FOUND');
  posts[idx] = { ...posts[idx], ...body };
  return posts[idx];
};
`);

  // routes/api/posts/[id]/delete.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'posts', '[id]', 'delete.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { posts } from '../../../../data/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  response: z.object({ success: z.boolean(), message: z.string() }),
};

export default async ({ params }: { params: { id: string } }) => {
  const idx = posts.findIndex(p => p.id === params.id);
  if (idx === -1) throw new KozoError('Post not found', 404, 'NOT_FOUND');
  posts.splice(idx, 1);
  return { success: true, message: 'Post deleted' };
};
`);

  // routes/api/tasks/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'tasks', 'get.ts'), `import { z } from 'zod';
import { tasks } from '../../../data/index.js';
import { TaskSchema } from '../../../schemas/index.js';

export const schema = {
  query: z.object({
    completed: z.coerce.boolean().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
  response: z.array(TaskSchema),
};

export default async ({
  query,
}: {
  query: { completed?: boolean; priority?: 'low' | 'medium' | 'high' };
}) => {
  let result = [...tasks];
  if (query.completed !== undefined) {
    result = result.filter(t => t.completed === query.completed);
  }
  if (query.priority) {
    result = result.filter(t => t.priority === query.priority);
  }
  return result;
};
`);

  // routes/api/tasks/post.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'tasks', 'post.ts'), `import { tasks } from '../../../data/index.js';
import { TaskSchema, CreateTaskBody } from '../../../schemas/index.js';

export const schema = {
  body: CreateTaskBody,
  response: TaskSchema,
};

export default async ({
  body,
}: {
  body: { title: string; priority?: 'low' | 'medium' | 'high' };
}) => {
  const newTask = {
    id: String(Date.now()),
    title: body.title,
    completed: false,
    priority: body.priority ?? ('medium' as const),
    createdAt: new Date().toISOString(),
  };
  tasks.push(newTask);
  return newTask;
};
`);

  // routes/api/tasks/[id]/get.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'tasks', '[id]', 'get.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { tasks } from '../../../../data/index.js';
import { TaskSchema } from '../../../../schemas/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  response: TaskSchema,
};

export default async ({ params }: { params: { id: string } }) => {
  const task = tasks.find(t => t.id === params.id);
  if (!task) throw new KozoError('Task not found', 404, 'NOT_FOUND');
  return task;
};
`);

  // routes/api/tasks/[id]/put.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'tasks', '[id]', 'put.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { tasks } from '../../../../data/index.js';
import { TaskSchema, UpdateTaskBody } from '../../../../schemas/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  body: UpdateTaskBody,
  response: TaskSchema,
};

export default async ({
  params,
  body,
}: {
  params: { id: string };
  body: { title?: string; completed?: boolean; priority?: 'low' | 'medium' | 'high' };
}) => {
  const idx = tasks.findIndex(t => t.id === params.id);
  if (idx === -1) throw new KozoError('Task not found', 404, 'NOT_FOUND');
  tasks[idx] = { ...tasks[idx], ...body };
  return tasks[idx];
};
`);

  // routes/api/tasks/[id]/delete.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'tasks', '[id]', 'delete.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { tasks } from '../../../../data/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  response: z.object({ success: z.boolean(), message: z.string() }),
};

export default async ({ params }: { params: { id: string } }) => {
  const idx = tasks.findIndex(t => t.id === params.id);
  if (idx === -1) throw new KozoError('Task not found', 404, 'NOT_FOUND');
  tasks.splice(idx, 1);
  return { success: true, message: 'Task deleted' };
};
`);

  // routes/api/tasks/[id]/toggle/patch.ts
  await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'tasks', '[id]', 'toggle', 'patch.ts'), `import { z } from 'zod';
import { KozoError } from '@kozojs/core';
import { tasks } from '../../../../../data/index.js';
import { TaskSchema } from '../../../../../schemas/index.js';

export const schema = {
  params: z.object({ id: z.string() }),
  response: TaskSchema,
};

export default async ({ params }: { params: { id: string } }) => {
  const idx = tasks.findIndex(t => t.id === params.id);
  if (idx === -1) throw new KozoError('Task not found', 404, 'NOT_FOUND');
  tasks[idx].completed = !tasks[idx].completed;
  return tasks[idx];
};
`);

  // routes/api/auth/login/post.ts (only when auth is enabled)
  if (auth) {
    await fs.outputFile(path.join(apiDir, 'src', 'routes', 'api', 'auth', 'login', 'post.ts'), `import { z } from 'zod';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { requireSecret } from '@kozojs/core';
import { createJWT, UnauthorizedError } from '@kozojs/auth';

// Read once at module load, with no fallback — a missing JWT_SECRET fails the
// boot rather than the first login request.
const JWT_SECRET = requireSecret('JWT_SECRET');
const scryptAsync = promisify(scrypt);

// scrypt password hashing — no external dependency. The cost parameters are
// stored in each hash, so they can be raised later without invalidating hashes
// already on disk. The format is: scrypt$N$r$p$salt$key (salt and key base64url).
async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(pw, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return 'scrypt$32768$8$1$' + salt.toString('base64url') + '$' + key.toString('base64url');
}
async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (expected.length === 0) return false;
  const key = (await scryptAsync(pw, salt, expected.length, {
    N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Demo accounts. The passwords below are what you log in with; they are hashed
// at startup and are never stored or compared in plaintext.
const DEMO_USERS = await Promise.all(
  [
    { email: 'admin@demo.com', password: 'admin123', role: 'admin', name: 'Admin' },
    { email: 'user@demo.com', password: 'user123', role: 'user', name: 'User' },
  ].map(async (u) => ({ ...u, password: await hashPassword(u.password) })),
);

export const schema = {
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  response: z.object({
    token: z.string(),
    user: z.object({
      email: z.string(),
      role: z.string(),
      name: z.string(),
    }),
  }),
};

export default async ({ body }: { body: { email: string; password: string } }) => {
  const user = DEMO_USERS.find(u => u.email === body.email);
  if (!user || !(await verifyPassword(body.password, user.password))) {
    throw new UnauthorizedError('Invalid credentials');
  }
  const token = await createJWT(
    { email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
  return { token, user: { email: user.email, role: user.role, name: user.name } };
};
`);
  }
}

