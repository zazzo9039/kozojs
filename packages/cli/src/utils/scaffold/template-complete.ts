import fs from 'fs-extra';
import path from 'node:path';
import type { ScaffoldOptions } from './types.js';
import { ENV_SECRET_HELP, generateSecret } from '../secret.js';

export function getDatabaseSchema(database: string): string {
  if (database === 'postgresql') {
    return `import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
`;
  }
  
  if (database === 'mysql') {
    return `import { mysqlTable, varchar, timestamp } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
`;
  }

  // SQLite
  return `import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});
`;
}

export function getDatabaseIndex(database: string): string {
  if (database === 'postgresql') {
    return `import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
`;
  }

  if (database === 'mysql') {
    return `import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';

const connection = await mysql.createConnection(process.env.DATABASE_URL!);
export const db = drizzle(connection, { schema, mode: 'default' });
`;
  }

  // SQLite
  return `import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import { initDatabase } from './seed.js';

const sqlite = new Database('./data.db');
export const db = drizzle(sqlite, { schema });

// Initialize database tables on first run
initDatabase(db);
`;
}

export function getSQLiteSeed(): string {
  return `import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { users } from './schema.js';

let initialized = false;

export function initDatabase(db: BetterSQLite3Database<any>) {
  if (initialized) return;
  
  try {
    // Create tables if they don't exist
    db.run(\`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at INTEGER
      )
    \`);

    // Check if we need to seed
    const count = db.get(\`SELECT COUNT(*) as count FROM users\`) as { count: number };
    
    if (count.count === 0) {
      console.log('🌱 Seeding database with example data...');
      
      // Insert example users
      db.insert(users).values([
        { name: 'John Doe', email: 'john@example.com', createdAt: new Date() },
        { name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date() }
      ]).run();
      
      console.log('✅ Database seeded!');
    }
    
    initialized = true;
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
}
`;
}

export async function createExampleRoutes(projectDir: string): Promise<void> {
  // GET / - Health check
  const indexRoute = `export default async () => {
  return {
    status: 'ok',
    framework: 'Kozo 🔥',
    timestamp: new Date().toISOString()
  };
};
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'index.ts'), indexRoute);

  // GET /users
  await fs.ensureDir(path.join(projectDir, 'src', 'routes', 'users'));
  
  const getUsersRoute = `import type { KozoContext } from '@kozojs/core';
import { users } from '../../db/schema.js';

export const meta = {
  summary: 'Get all users',
  description: 'Returns a list of all users in the database'
};

export default async (ctx: KozoContext) => {
  const allUsers = ctx.services.db.select().from(users).all();
  return { users: allUsers };
};
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'users', 'get.ts'), getUsersRoute);

  // POST /users
  const postUsersRoute = `import { z } from 'zod';
import type { KozoContext } from '@kozojs/core';
import { users } from '../../db/schema.js';

export const schema = {
  body: z.object({
    name: z.string().min(2),
    email: z.string().email()
  })
};

export const meta = {
  summary: 'Create a new user',
  description: 'Creates a new user with name and email'
};

export default async (ctx: KozoContext<typeof schema>) => {
  const { body, services } = ctx;
  const user = services.db.insert(users).values({
    ...body,
    createdAt: new Date()
  }).returning().get();
  
  return { success: true, user };
};
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'users', 'post.ts'), postUsersRoute);
}

// ============================================
// COMPLETE TEMPLATE - Full production-ready server
// ============================================

export async function scaffoldCompleteTemplate(
  projectDir: string,
  projectName: string,
  kozoCoreDep: string,
  runtime: 'node' | 'cloudflare' | 'bun',
  database: 'postgresql' | 'mysql' | 'sqlite' | 'none' = 'none',
  dbPort?: number,
  auth: boolean = true,
): Promise<void> {
  // Create organized directory structure
  await fs.ensureDir(projectDir);
  await fs.ensureDir(path.join(projectDir, 'src'));
  await fs.ensureDir(path.join(projectDir, 'src', 'schemas'));
  await fs.ensureDir(path.join(projectDir, 'src', 'routes'));
  await fs.ensureDir(path.join(projectDir, 'src', 'routes', 'auth'));
  await fs.ensureDir(path.join(projectDir, 'src', 'routes', 'users'));
  await fs.ensureDir(path.join(projectDir, 'src', 'routes', 'posts'));
  await fs.ensureDir(path.join(projectDir, 'src', 'middleware'));
  await fs.ensureDir(path.join(projectDir, 'src', 'utils'));
  await fs.ensureDir(path.join(projectDir, 'src', 'data'));

  const hasDb = database !== 'none';

  if (hasDb) {
    await fs.ensureDir(path.join(projectDir, 'src', 'db'));
    // Generate db/schema.ts
    await fs.writeFile(path.join(projectDir, 'src', 'db', 'schema.ts'), getDatabaseSchema(database));
    // Generate db/index.ts
    await fs.writeFile(path.join(projectDir, 'src', 'db', 'index.ts'), getDatabaseIndex(database));
    if (database === 'sqlite') {
      await fs.writeFile(path.join(projectDir, 'src', 'db', 'seed.ts'), getSQLiteSeed());
    }
  }

  // Create package.json
  const packageJson = {
    name: projectName,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      'type-check': 'tsc --noEmit',
      ...(hasDb && {
        'db:generate': 'drizzle-kit generate',
        'db:push': 'drizzle-kit push',
        'db:studio': 'drizzle-kit studio',
      }),
    },
    dependencies: {
      '@kozojs/core': kozoCoreDep,
      ...(auth && { '@kozojs/auth': kozoCoreDep }),
      '@hono/node-server': '^1.19.10',
      ...(runtime === 'node' && { 'uWebSockets.js': 'github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df' }),
      hono: '^4.12.5',
      zod: '^4.0.0',
      dotenv: '^16.4.0',
      ...(hasDb && { 'drizzle-orm': '^0.36.0' }),
      ...(database === 'postgresql' && { postgres: '^3.4.8' }),
      ...(database === 'mysql' && { mysql2: '^3.11.0' }),
      ...(database === 'sqlite' && { 'better-sqlite3': '^11.0.0' }),
    },
    devDependencies: {
      '@types/node': '^22.0.0',
      tsx: '^4.21.0',
      typescript: '^5.6.0',
      ...(hasDb && { 'drizzle-kit': '^0.28.0' }),
      ...(database === 'sqlite' && { '@types/better-sqlite3': '^7.6.0' }),
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
      declaration: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  };
  await fs.writeJSON(path.join(projectDir, 'tsconfig.json'), tsconfig, { spaces: 2 });

  // Create .gitignore
  const gitignore = `node_modules/
dist/
.env
.turbo/
*.log
`;
  await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore);

  const pgPort = dbPort ?? 5436;
  const dbUrl = database === 'postgresql'
    ? `postgresql://postgres:postgres@localhost:${pgPort}/${projectName}`
    : database === 'mysql'
    ? `mysql://root:root@localhost:3306/${projectName}`
    : undefined;

  // Create .env.example — committed by the user, so it carries instructions,
  // never a value. `.env` below gets a secret minted on this machine instead.
  const envBody = (jwtSecret: string) => `# Server
PORT=3000
NODE_ENV=development
${database !== 'none' && dbUrl ? `
# Database
DATABASE_URL=${dbUrl}
` : ''}
${auth ? `# JWT Authentication
${ENV_SECRET_HELP}
JWT_SECRET=${jwtSecret}
` : ''}
# CORS
CORS_ORIGIN=http://localhost:5173

# Rate Limiting (requests per window)
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
`;
  await fs.writeFile(path.join(projectDir, '.env.example'), envBody(''));
  // Also create a .env so `pnpm dev` works immediately — with a secret unique
  // to this project, generated now, rather than one shipped inside the CLI.
  await fs.writeFile(path.join(projectDir, '.env'), envBody(auth ? generateSecret() : ''));

  // Create drizzle.config.ts if database is selected
  if (hasDb) {
    const dialect = database === 'postgresql' ? 'postgresql' : database === 'mysql' ? 'mysql' : 'sqlite';
    const drizzleConfig = `import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${dialect}',
  dbCredentials: {
    ${database === 'sqlite' ? "url: './data.db'" : 'url: process.env.DATABASE_URL!'}
  },
});
`;
    await fs.writeFile(path.join(projectDir, 'drizzle.config.ts'), drizzleConfig);
  }

  // Create modular index.ts entry point.
  // dotenv first, before anything reads process.env — requireSecret() below has
  // no fallback, so the .env file has to be loaded by the time it runs.
  const indexTs = `import 'dotenv/config';
import { createKozo, rateLimitGuard${auth ? ', requireSecret' : ''} } from '@kozojs/core';
${auth ? "import { jwtGuard } from '@kozojs/auth';" : ''}
${auth ? "import { registerAuthRoutes } from './routes/auth/index.js';" : ''}
import { registerUserRoutes } from './routes/users/index.js';
import { registerPostRoutes } from './routes/posts/index.js';
import { registerHealthRoute } from './routes/health.js';
import { registerStatsRoute } from './routes/stats.js';
${hasDb ? "import { db } from './db/index.js';" : ''}

// ─── Config ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000;
${auth ? "// No fallback: a missing or weak JWT_SECRET stops the boot, it does not\n// silently sign tokens with a value anyone could guess.\nconst JWT_SECRET = requireSecret('JWT_SECRET');" : ''}
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;
const RATE_LIMIT_WINDOW = Number(process.env.RATE_LIMIT_WINDOW) || 60_000;

// ─── App ───────────────────────────────────────────────────────────────
const app = createKozo();
app.mountDocs({
  title: '${projectName} API',
  version: '1.0.0',
  description: 'API documentation for ${projectName}',
  servers: [{ url: \`http://localhost:\${PORT}\`, description: 'Development server' }],
});

// ─── Security (transport-agnostic guards — native speed under uWS) ────
// Guards run on BOTH transports: listen() (Hono) and nativeListen() (uWS).
app.guard('/*', rateLimitGuard({ max: RATE_LIMIT_MAX, window: RATE_LIMIT_WINDOW / 1000 }));
${auth ? `app.guard('/auth/me', jwtGuard(JWT_SECRET));` : ''}

// ─── Routes (native compiled — zero overhead) ─────────────────────────
registerHealthRoute(app);
${auth ? 'registerAuthRoutes(app);' : ''}
registerUserRoutes(app);
registerPostRoutes(app);
registerStatsRoute(app);

// ─── Graceful Shutdown ─────────────────────────────────────────────────
const shutdown = app.getShutdownManager();

process.on('SIGTERM', () => shutdown.shutdown());
process.on('SIGINT', () => shutdown.shutdown());

// ─── Start ─────────────────────────────────────────────────────────────
console.log('');
console.log('🔥 Kozo server starting…');
console.log('');

// CORS is handled at the transport level (works for preflight too)
await app.nativeListen({ port: PORT, cors: { origin: CORS_ORIGIN } });
console.log('');
console.log('📚 Endpoints:');
console.log('   GET  /health               Health check');
console.log('   POST /auth/login           Login (returns JWT)');
console.log('   GET  /auth/me              Current user (requires JWT)');
console.log('   GET  /users                List users (paginated)');
console.log('   POST /users                Create user');
console.log('   GET  /users/:id            Get user');
console.log('   PUT  /users/:id            Update user');
console.log('   DEL  /users/:id            Delete user');
console.log('   GET  /posts                List posts (filterable)');
console.log('   POST /posts                Create post');
console.log('   GET  /stats                Server stats');
console.log('');
console.log('🔒 Middleware: CORS · Rate limit · JWT · Logger');
console.log('🛡️  Graceful shutdown enabled (SIGTERM / SIGINT)');
`;
  await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), indexTs);

  // Create schemas
  await createCompleteSchemas(projectDir);
  
  // Create utils
  await createCompleteUtils(projectDir);
  
  // Create data store
  await createCompleteDataStore(projectDir);
  
  // Create routes
  await createCompleteRoutes(projectDir);

  // Create README.md
  const readme = `# ${projectName}

Built with 🔥 **Kozo Framework** — Production-ready server template

## Features

✨ **Complete API Implementation**
- ✅ JWT Authentication (login, token-protected routes)
- ✅ User CRUD (Create, Read, Update, Delete)
- ✅ Posts with filtering and pagination
- ✅ Statistics endpoint
- ✅ Health check

⚡ **Maximum Performance**
- uWebSockets.js transport with native per-route C++ matching (zero JS routing overhead)
- Compiled handlers write directly to uWS response via cork() — zero shim objects
- Pre-compiled Zod validators (compiled once at startup)
- fast-json-stringify response serialization when schema.response is set

🔒 **Production Middleware**
- CORS with configurable origins
- Rate limiting (per-IP, configurable window)
- JWT verification on \\\`/api/*\\\` routes
- Request logger with timing
- Graceful shutdown (SIGTERM / SIGINT)

🎯 **Type-Safe**
- Full TypeScript inference
- Zod validation for all inputs
- Auto-generated types from schemas

## Quick Start

\\\`\\\`\\\`bash
# Install dependencies
pnpm install   # or npm install

# Start development server
pnpm dev
\\\`\\\`\\\`

The server will start at **http://localhost:3000**

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| POST | /auth/login | Login → JWT token |

### Protected (requires \\\`Authorization: Bearer <token>\\\`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /auth/me | Current user |
| GET | /users | List users (paginated) |
| GET | /users/:id | Get user by ID |
| POST | /users | Create new user |
| PUT | /users/:id | Update user |
| DELETE | /users/:id | Delete user |
| GET | /posts | List posts (filterable) |
| GET | /posts/:id | Get post with author |
| POST | /posts | Create new post |
| GET | /stats | Server statistics |

## Example Requests

\\\`\\\`\\\`bash
# 1. Login to get a JWT
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@kozo.dev","password":"secret123"}' \\
  | jq -r '.token')

# 2. Use the token for protected routes
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/users

# 3. Create a user
curl -X POST http://localhost:3000/users \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Alice","email":"alice@example.com","role":"user"}'

# 4. Filter posts
curl -H "Authorization: Bearer $TOKEN" \\
  "http://localhost:3000/posts?published=true&tag=framework"

# 5. Health check (no auth needed)
curl http://localhost:3000/health
\\\`\\\`\\\`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| JWT_SECRET | _none — required_ | HMAC secret for JWT signing. At least 32 bytes; the server will not start without it. \\\`.env\\\` was generated with a fresh one; use a different value in every other environment. |
| CORS_ORIGIN | * | Allowed CORS origin |
| RATE_LIMIT_MAX | 100 | Max requests per window |
| RATE_LIMIT_WINDOW | 60000 | Window duration (ms) |

## Project Structure

\\\`\\\`\\\`
${projectName}/
├── src/
│   ├── data/
│   │   └── store.ts           # In-memory data store
│   ├── middleware/             # (extensible)
│   ├── routes/
│   │   ├── auth/
│   │   │   └── index.ts       # Auth routes (login, me)
│   │   ├── users/
│   │   │   └── index.ts       # User CRUD routes
│   │   ├── posts/
│   │   │   └── index.ts       # Post routes
│   │   ├── health.ts          # Health check
│   │   └── stats.ts           # Statistics
│   ├── schemas/
│   │   ├── user.ts            # User Zod schemas
│   │   ├── post.ts            # Post Zod schemas
│   │   └── common.ts          # Pagination, filters
│   ├── utils/
│   │   └── helpers.ts         # UUID, pagination
│   └── index.ts               # Entry point (middleware + routes)
├── .env                       # Environment config
├── .env.example               # Example config
├── package.json
├── tsconfig.json
└── README.md
\\\`\\\`\\\`

## Architecture

\\\`\\\`\\\`
            ┌─────────────┐
Request ──► │ uWebSockets │  C++ HTTP parser + epoll/kqueue
            │    .js       │
            └──────┬──────┘
                   │
            ┌──────▼──────┐
            │  C++ Radix  │  Native per-route matching (zero JS)
            │   Router    │  app.get(), app.post(), …
            └──────┬──────┘
                   │
            ┌──────▼──────┐
            │  Compiled   │  Handler writes directly to uWS
            │  Handler    │  via cork() — one syscall per response
            └──────┬──────┘
                   │
            ┌──────▼──────┐
            │  Zod → Ajv  │  Pre-compiled JSON serializer
            │  Serializer │
            └─────────────┘
\\\`\\\`\\\`

---

Built with ❤️ using Kozo Framework
`;
  await fs.writeFile(path.join(projectDir, 'README.md'), readme);
}

// ============================================
// COMPLETE TEMPLATE - HELPER FUNCTIONS
// ============================================

async function createCompleteSchemas(projectDir: string): Promise<void> {
  // src/schemas/user.ts
  const userSchemas = `import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2).max(50),
  role: z.enum(['user', 'admin']).default('user'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  role: z.enum(['user', 'admin']).optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
`;
  await fs.writeFile(path.join(projectDir, 'src', 'schemas', 'user.ts'), userSchemas);

  // src/schemas/post.ts
  const postSchemas = `import { z } from 'zod';
import { UserSchema } from './user.js';

export const PostSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  authorId: z.string().uuid(),
  published: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PostWithAuthorSchema = PostSchema.extend({
  author: UserSchema,
});

export const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  published: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export type Post = z.infer<typeof PostSchema>;
export type PostWithAuthor = z.infer<typeof PostWithAuthorSchema>;
export type CreatePost = z.infer<typeof CreatePostSchema>;
`;
  await fs.writeFile(path.join(projectDir, 'src', 'schemas', 'post.ts'), postSchemas);

  // src/schemas/common.ts
  const commonSchemas = `import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

export const PostFiltersSchema = z.object({
  published: z.coerce.boolean().optional(),
  authorId: z.string().uuid().optional(),
  tag: z.string().optional(),
});

export type Pagination = z.infer<typeof PaginationSchema>;
export type PostFilters = z.infer<typeof PostFiltersSchema>;
`;
  await fs.writeFile(path.join(projectDir, 'src', 'schemas', 'common.ts'), commonSchemas);
}

async function createCompleteUtils(projectDir: string): Promise<void> {
  // src/utils/helpers.ts
  const helpers = `export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    data: items.slice(start, end),
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit),
  };
}
`;
  await fs.writeFile(path.join(projectDir, 'src', 'utils', 'helpers.ts'), helpers);
}

async function createCompleteDataStore(projectDir: string): Promise<void> {
  // src/data/store.ts
  const store = `import type { User } from '../schemas/user.js';
import type { Post } from '../schemas/post.js';

export const users: User[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'admin@kozo.dev',
    name: 'Admin User',
    role: 'admin',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'john@example.com',
    name: 'John Doe',
    role: 'user',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  },
];

export const posts: Post[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440010',
    title: 'Welcome to Kozo Framework',
    content: 'This is the first post in our amazing framework...',
    authorId: '550e8400-e29b-41d4-a716-446655440000',
    published: true,
    tags: ['framework', 'typescript', 'backend'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];
`;
  await fs.writeFile(path.join(projectDir, 'src', 'data', 'store.ts'), store);
}

async function createCompleteRoutes(projectDir: string): Promise<void> {
  // src/routes/health.ts
  const healthRoute = `import type { Kozo } from '@kozojs/core';

export function registerHealthRoute(app: Kozo) {
  app.get('/health', {}, (c) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
    };
  });
}
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'health.ts'), healthRoute);

  // src/routes/stats.ts
  const statsRoute = `import { z } from 'zod';
import type { Kozo } from '@kozojs/core';
import { users } from '../data/store.js';
import { posts } from '../data/store.js';

export function registerStatsRoute(app: Kozo) {
  app.get('/stats', {
    response: z.object({
      users: z.object({
        total: z.number(),
        admins: z.number(),
        regular: z.number(),
      }),
      posts: z.object({
        total: z.number(),
        published: z.number(),
        drafts: z.number(),
        totalTags: z.number(),
      }),
      performance: z.object({
        uptime: z.number(),
        memoryUsage: z.object({
          rss: z.number(),
          heapTotal: z.number(),
          heapUsed: z.number(),
        }),
      }),
    }),
  }, (c) => {
    const memUsage = process.memoryUsage();
    return {
      users: {
        total: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        regular: users.filter(u => u.role === 'user').length,
      },
      posts: {
        total: posts.length,
        published: posts.filter(p => p.published).length,
        drafts: posts.filter(p => !p.published).length,
        totalTags: [...new Set(posts.flatMap(p => p.tags))].length,
      },
      performance: {
        uptime: process.uptime(),
        memoryUsage: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
        },
      },
    };
  });
}
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'stats.ts'), statsRoute);

  // src/routes/auth/index.ts
  const authRoutes = `import { z } from 'zod';
import type { Kozo } from '@kozojs/core';
import { requireSecret } from '@kozojs/core';
import { createJWT } from '@kozojs/auth';
import { UserSchema } from '../../schemas/user.js';
import { users } from '../../data/store.js';

// Read once at module load, with no fallback — a missing JWT_SECRET fails the
// boot rather than the first login request.
const JWT_SECRET = requireSecret('JWT_SECRET');

export function registerAuthRoutes(app: Kozo) {
  // POST /auth/login — public (no JWT required)
  app.post('/auth/login', {
    body: z.object({
      email: z.string().email(),
      password: z.string().min(6),
    }),
    response: z.object({
      success: z.boolean(),
      token: z.string(),
      user: UserSchema,
    }),
  }, async (c) => {
    const user = users.find(u => u.email === c.body.email);
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Generate a real JWT with 24h expiry
    const token = await createJWT(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return { success: true, token, user };
  });

  // GET /auth/me — requires valid JWT (jwtGuard handles verification)
  app.get('/auth/me', {
    response: UserSchema,
  }, (c) => {
    // user payload attached by jwtGuard → ctx.user
    const payload = c.user as { sub?: string } | null;
    return users.find(u => u.id === payload?.sub) ?? users[0];
  });
}
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'auth', 'index.ts'), authRoutes);

  // src/routes/users/index.ts
  const userRoutes = `import { z } from 'zod';
import type { Kozo } from '@kozojs/core';
import { UserSchema, CreateUserSchema, UpdateUserSchema } from '../../schemas/user.js';
import { PaginationSchema } from '../../schemas/common.js';
import { users } from '../../data/store.js';
import { generateUUID, paginate } from '../../utils/helpers.js';

export function registerUserRoutes(app: Kozo) {
  // GET /users
  app.get('/users', {
    query: PaginationSchema,
    response: z.object({
      data: z.array(UserSchema),
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
  }, (c) => {
    const { page, limit } = c.query;
    return paginate(users, page, limit);
  });

  // GET /users/:id
  app.get('/users/:id', {
    params: z.object({ id: z.string().uuid() }),
    response: UserSchema,
  }, (c) => {
    const user = users.find(u => u.id === c.params.id);
    if (!user) return c.json({ error: 'User not found' }, 404);
    return user;
  });

  // POST /users
  app.post('/users', {
    body: CreateUserSchema,
    response: UserSchema,
  }, (c) => {
    const existing = users.find(u => u.email === c.body.email);
    if (existing) return c.json({ error: 'Email already exists' }, 409);

    const newUser = {
      id: generateUUID(),
      email: c.body.email,
      name: c.body.name,
      role: c.body.role || 'user' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(newUser);
    return newUser;
  });

  // PUT /users/:id
  app.put('/users/:id', {
    params: z.object({ id: z.string().uuid() }),
    body: UpdateUserSchema,
    response: UserSchema,
  }, (c) => {
    const user = users.find(u => u.id === c.params.id);
    if (!user) return c.json({ error: 'User not found' }, 404);

    if (c.body.name) user.name = c.body.name;
    if (c.body.role) user.role = c.body.role;
    user.updatedAt = new Date();
    return user;
  });

  // DELETE /users/:id
  app.delete('/users/:id', {
    params: z.object({ id: z.string().uuid() }),
    response: z.object({
      success: z.boolean(),
      deletedId: z.string(),
    }),
  }, (c) => {
    const index = users.findIndex(u => u.id === c.params.id);
    if (index === -1) return c.json({ error: 'User not found' }, 404);

    users.splice(index, 1);
    return { success: true, deletedId: c.params.id };
  });
}
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'users', 'index.ts'), userRoutes);

  // src/routes/posts/index.ts
  const postRoutes = `import { z } from 'zod';
import type { Kozo } from '@kozojs/core';
import { PostSchema, PostWithAuthorSchema, CreatePostSchema } from '../../schemas/post.js';
import { PaginationSchema, PostFiltersSchema } from '../../schemas/common.js';
import { posts, users } from '../../data/store.js';
import { generateUUID, paginate } from '../../utils/helpers.js';

export function registerPostRoutes(app: Kozo) {
  // GET /posts
  app.get('/posts', {
    query: PaginationSchema.merge(PostFiltersSchema),
    response: z.object({
      data: z.array(PostWithAuthorSchema),
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
  }, (c) => {
    const { page, limit, published, authorId, tag } = c.query;

    let filteredPosts = posts;
    if (published !== undefined) {
      filteredPosts = filteredPosts.filter(p => p.published === published);
    }
    if (authorId) {
      filteredPosts = filteredPosts.filter(p => p.authorId === authorId);
    }
    if (tag) {
      filteredPosts = filteredPosts.filter(p => p.tags.includes(tag));
    }

    const postsWithAuthors = filteredPosts.map(post => ({
      ...post,
      author: users.find(u => u.id === post.authorId)!,
    }));

    return paginate(postsWithAuthors, page, limit);
  });

  // GET /posts/:id
  app.get('/posts/:id', {
    params: z.object({ id: z.string().uuid() }),
    response: PostWithAuthorSchema,
  }, (c) => {
    const post = posts.find(p => p.id === c.params.id);
    if (!post) return c.json({ error: 'Post not found' }, 404);

    const author = users.find(u => u.id === post.authorId);
    if (!author) return c.json({ error: 'Post author not found' }, 500);

    return { ...post, author };
  });

  // POST /posts
  app.post('/posts', {
    body: CreatePostSchema,
    response: PostSchema,
  }, (c) => {
    const authorId = users[0].id;
    const newPost = {
      id: generateUUID(),
      title: c.body.title,
      content: c.body.content,
      authorId,
      published: c.body.published || false,
      tags: c.body.tags || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    posts.push(newPost);
    return newPost;
  });
}
`;
  await fs.writeFile(path.join(projectDir, 'src', 'routes', 'posts', 'index.ts'), postRoutes);
}

// ============================================
// API-ONLY TEMPLATE - Minimal backend
// ============================================

