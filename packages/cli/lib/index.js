#!/usr/bin/env node
(() => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 19)) {
    console.error("@kozojs/cli requires Node >= 20.19 (current: " + process.version + ").");
    process.exit(1);
  }
})();
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_commander = require("commander");

// src/commands/new.ts
var p = __toESM(require("@clack/prompts"));
var import_picocolors2 = __toESM(require("picocolors"));
var import_execa = require("execa");

// src/utils/scaffold/index.ts
var import_fs_extra5 = __toESM(require("fs-extra"));
var import_node_path5 = __toESM(require("path"));

// src/utils/scaffold/template-complete.ts
var import_fs_extra = __toESM(require("fs-extra"));
var import_node_path = __toESM(require("path"));

// src/utils/secret.ts
var import_node_crypto = require("crypto");
var GENERATE_SECRET_COMMAND = `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`;
function generateSecret() {
  return (0, import_node_crypto.randomBytes)(48).toString("base64url");
}
var ENV_SECRET_HELP = [
  "# Required \u2014 no default. The app refuses to start without it.",
  "# Generate one and paste it below:",
  `#   ${GENERATE_SECRET_COMMAND}`,
  "# Use a different value per environment, and never commit the filled-in .env."
].join("\n");

// src/utils/scaffold/template-complete.ts
function getDatabaseSchema(database) {
  if (database === "postgresql") {
    return `import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
`;
  }
  if (database === "mysql") {
    return `import { mysqlTable, varchar, timestamp } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
`;
  }
  return `import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date())
});
`;
}
function getDatabaseIndex(database) {
  if (database === "postgresql") {
    return `import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
`;
  }
  if (database === "mysql") {
    return `import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';

const connection = await mysql.createConnection(process.env.DATABASE_URL!);
export const db = drizzle(connection, { schema, mode: 'default' });
`;
  }
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
function getSQLiteSeed() {
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
      console.log('\u{1F331} Seeding database with example data...');
      
      // Insert example users
      db.insert(users).values([
        { name: 'John Doe', email: 'john@example.com', createdAt: new Date() },
        { name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date() }
      ]).run();
      
      console.log('\u2705 Database seeded!');
    }
    
    initialized = true;
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
}
`;
}
async function createExampleRoutes(projectDir) {
  const indexRoute = `export default async () => {
  return {
    status: 'ok',
    framework: 'Kozo \u{1F525}',
    timestamp: new Date().toISOString()
  };
};
`;
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "index.ts"), indexRoute);
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "routes", "users"));
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "users", "get.ts"), getUsersRoute);
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "users", "post.ts"), postUsersRoute);
}
async function scaffoldCompleteTemplate(projectDir, projectName, kozoCoreDep, runtime, database = "none", dbPort, auth = true) {
  await import_fs_extra.default.ensureDir(projectDir);
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "schemas"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "routes"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "routes", "auth"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "routes", "users"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "routes", "posts"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "middleware"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "utils"));
  await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "data"));
  const hasDb = database !== "none";
  if (hasDb) {
    await import_fs_extra.default.ensureDir(import_node_path.default.join(projectDir, "src", "db"));
    await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "db", "schema.ts"), getDatabaseSchema(database));
    await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "db", "index.ts"), getDatabaseIndex(database));
    if (database === "sqlite") {
      await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "db", "seed.ts"), getSQLiteSeed());
    }
  }
  const packageJson = {
    name: projectName,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
      "type-check": "tsc --noEmit",
      ...hasDb && {
        "db:generate": "drizzle-kit generate",
        "db:push": "drizzle-kit push",
        "db:studio": "drizzle-kit studio"
      }
    },
    dependencies: {
      "@kozojs/core": kozoCoreDep,
      ...auth && { "@kozojs/auth": kozoCoreDep === "workspace:*" ? "workspace:*" : "^0.5.21" },
      "@hono/node-server": "^1.19.10",
      ...runtime === "node" && { "uWebSockets.js": "github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df" },
      hono: "^4.12.5",
      zod: "^4.0.0",
      dotenv: "^16.4.0",
      ...hasDb && { "drizzle-orm": "^0.36.0" },
      ...database === "postgresql" && { postgres: "^3.4.8" },
      ...database === "mysql" && { mysql2: "^3.11.0" },
      ...database === "sqlite" && { "better-sqlite3": "^11.0.0" }
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      tsx: "^4.21.0",
      typescript: "^5.6.0",
      ...hasDb && { "drizzle-kit": "^0.28.0" },
      ...database === "sqlite" && { "@types/better-sqlite3": "^7.6.0" }
    }
  };
  await import_fs_extra.default.writeJSON(import_node_path.default.join(projectDir, "package.json"), packageJson, { spaces: 2 });
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src",
      declaration: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
  };
  await import_fs_extra.default.writeJSON(import_node_path.default.join(projectDir, "tsconfig.json"), tsconfig, { spaces: 2 });
  const gitignore = `node_modules/
dist/
.env
.turbo/
*.log
`;
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, ".gitignore"), gitignore);
  const pgPort = dbPort ?? 5436;
  const dbUrl = database === "postgresql" ? `postgresql://postgres:postgres@localhost:${pgPort}/${projectName}` : database === "mysql" ? `mysql://root:root@localhost:3306/${projectName}` : void 0;
  const envBody = (jwtSecret) => `# Server
PORT=3000
NODE_ENV=development
${database !== "none" && dbUrl ? `
# Database
DATABASE_URL=${dbUrl}
` : ""}
${auth ? `# JWT Authentication
${ENV_SECRET_HELP}
JWT_SECRET=${jwtSecret}
` : ""}
# CORS
CORS_ORIGIN=http://localhost:5173

# Rate Limiting (requests per window)
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
`;
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, ".env.example"), envBody(""));
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, ".env"), envBody(auth ? generateSecret() : ""));
  if (hasDb) {
    const dialect = database === "postgresql" ? "postgresql" : database === "mysql" ? "mysql" : "sqlite";
    const drizzleConfig = `import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${dialect}',
  dbCredentials: {
    ${database === "sqlite" ? "url: './data.db'" : "url: process.env.DATABASE_URL!"}
  },
});
`;
    await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "drizzle.config.ts"), drizzleConfig);
  }
  const indexTs = `import 'dotenv/config';
import { createKozo, rateLimitGuard${auth ? ", requireSecret" : ""} } from '@kozojs/core';
${auth ? "import { jwtGuard } from '@kozojs/auth';" : ""}
${auth ? "import { registerAuthRoutes } from './routes/auth/index.js';" : ""}
import { registerUserRoutes } from './routes/users/index.js';
import { registerPostRoutes } from './routes/posts/index.js';
import { registerHealthRoute } from './routes/health.js';
import { registerStatsRoute } from './routes/stats.js';
${hasDb ? "import { db } from './db/index.js';" : ""}

// \u2500\u2500\u2500 Config \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const PORT = Number(process.env.PORT) || 3000;
${auth ? "// No fallback: a missing or weak JWT_SECRET stops the boot, it does not\n// silently sign tokens with a value anyone could guess.\nconst JWT_SECRET = requireSecret('JWT_SECRET');" : ""}
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;
const RATE_LIMIT_WINDOW = Number(process.env.RATE_LIMIT_WINDOW) || 60_000;

// \u2500\u2500\u2500 App \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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

// \u2500\u2500\u2500 Security (transport-agnostic guards \u2014 native speed under uWS) \u2500\u2500\u2500\u2500
// Guards run on BOTH transports: listen() (Hono) and nativeListen() (uWS).
app.guard('/*', rateLimitGuard({ max: RATE_LIMIT_MAX, window: RATE_LIMIT_WINDOW / 1000 }));
${auth ? `app.guard('/auth/me', jwtGuard(JWT_SECRET));` : ""}

// \u2500\u2500\u2500 Routes (native compiled \u2014 zero overhead) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
registerHealthRoute(app);
${auth ? "registerAuthRoutes(app);" : ""}
registerUserRoutes(app);
registerPostRoutes(app);
registerStatsRoute(app);

// \u2500\u2500\u2500 Graceful Shutdown \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const shutdown = app.getShutdownManager();

process.on('SIGTERM', () => shutdown.shutdown());
process.on('SIGINT', () => shutdown.shutdown());

// \u2500\u2500\u2500 Start \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
console.log('');
console.log('\u{1F525} Kozo server starting\u2026');
console.log('');

// CORS is handled at the transport level (works for preflight too)
await app.nativeListen({ port: PORT, cors: { origin: CORS_ORIGIN } });
console.log('');
console.log('\u{1F4DA} Endpoints:');
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
console.log('\u{1F512} Middleware: CORS \xB7 Rate limit \xB7 JWT \xB7 Logger');
console.log('\u{1F6E1}\uFE0F  Graceful shutdown enabled (SIGTERM / SIGINT)');
`;
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "index.ts"), indexTs);
  await createCompleteSchemas(projectDir);
  await createCompleteUtils(projectDir);
  await createCompleteDataStore(projectDir);
  await createCompleteRoutes(projectDir);
  const readme = `# ${projectName}

Built with \u{1F525} **Kozo Framework** \u2014 Production-ready server template

## Features

\u2728 **Complete API Implementation**
- \u2705 JWT Authentication (login, token-protected routes)
- \u2705 User CRUD (Create, Read, Update, Delete)
- \u2705 Posts with filtering and pagination
- \u2705 Statistics endpoint
- \u2705 Health check

\u26A1 **Maximum Performance**
- uWebSockets.js transport with native per-route C++ matching (zero JS routing overhead)
- Compiled handlers write directly to uWS response via cork() \u2014 zero shim objects
- Pre-compiled Zod validators (compiled once at startup)
- fast-json-stringify response serialization when schema.response is set

\u{1F512} **Production Middleware**
- CORS with configurable origins
- Rate limiting (per-IP, configurable window)
- JWT verification on \\\`/api/*\\\` routes
- Request logger with timing
- Graceful shutdown (SIGTERM / SIGINT)

\u{1F3AF} **Type-Safe**
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
| POST | /auth/login | Login \u2192 JWT token |

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
| JWT_SECRET | _none \u2014 required_ | HMAC secret for JWT signing. At least 32 bytes; the server will not start without it. \\\`.env\\\` was generated with a fresh one; use a different value in every other environment. |
| CORS_ORIGIN | * | Allowed CORS origin |
| RATE_LIMIT_MAX | 100 | Max requests per window |
| RATE_LIMIT_WINDOW | 60000 | Window duration (ms) |

## Project Structure

\\\`\\\`\\\`
${projectName}/
\u251C\u2500\u2500 src/
\u2502   \u251C\u2500\u2500 data/
\u2502   \u2502   \u2514\u2500\u2500 store.ts           # In-memory data store
\u2502   \u251C\u2500\u2500 middleware/             # (extensible)
\u2502   \u251C\u2500\u2500 routes/
\u2502   \u2502   \u251C\u2500\u2500 auth/
\u2502   \u2502   \u2502   \u2514\u2500\u2500 index.ts       # Auth routes (login, me)
\u2502   \u2502   \u251C\u2500\u2500 users/
\u2502   \u2502   \u2502   \u2514\u2500\u2500 index.ts       # User CRUD routes
\u2502   \u2502   \u251C\u2500\u2500 posts/
\u2502   \u2502   \u2502   \u2514\u2500\u2500 index.ts       # Post routes
\u2502   \u2502   \u251C\u2500\u2500 health.ts          # Health check
\u2502   \u2502   \u2514\u2500\u2500 stats.ts           # Statistics
\u2502   \u251C\u2500\u2500 schemas/
\u2502   \u2502   \u251C\u2500\u2500 user.ts            # User Zod schemas
\u2502   \u2502   \u251C\u2500\u2500 post.ts            # Post Zod schemas
\u2502   \u2502   \u2514\u2500\u2500 common.ts          # Pagination, filters
\u2502   \u251C\u2500\u2500 utils/
\u2502   \u2502   \u2514\u2500\u2500 helpers.ts         # UUID, pagination
\u2502   \u2514\u2500\u2500 index.ts               # Entry point (middleware + routes)
\u251C\u2500\u2500 .env                       # Environment config
\u251C\u2500\u2500 .env.example               # Example config
\u251C\u2500\u2500 package.json
\u251C\u2500\u2500 tsconfig.json
\u2514\u2500\u2500 README.md
\\\`\\\`\\\`

## Architecture

\\\`\\\`\\\`
            \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
Request \u2500\u2500\u25BA \u2502 uWebSockets \u2502  C++ HTTP parser + epoll/kqueue
            \u2502    .js       \u2502
            \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                   \u2502
            \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u25BC\u2500\u2500\u2500\u2500\u2500\u2500\u2510
            \u2502  C++ Radix  \u2502  Native per-route matching (zero JS)
            \u2502   Router    \u2502  app.get(), app.post(), \u2026
            \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                   \u2502
            \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u25BC\u2500\u2500\u2500\u2500\u2500\u2500\u2510
            \u2502  Compiled   \u2502  Handler writes directly to uWS
            \u2502  Handler    \u2502  via cork() \u2014 one syscall per response
            \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                   \u2502
            \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u25BC\u2500\u2500\u2500\u2500\u2500\u2500\u2510
            \u2502  Zod \u2192 Ajv  \u2502  Pre-compiled JSON serializer
            \u2502  Serializer \u2502
            \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
\\\`\\\`\\\`

---

Built with \u2764\uFE0F using Kozo Framework
`;
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "README.md"), readme);
}
async function createCompleteSchemas(projectDir) {
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "schemas", "user.ts"), userSchemas);
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "schemas", "post.ts"), postSchemas);
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "schemas", "common.ts"), commonSchemas);
}
async function createCompleteUtils(projectDir) {
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "utils", "helpers.ts"), helpers);
}
async function createCompleteDataStore(projectDir) {
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "data", "store.ts"), store);
}
async function createCompleteRoutes(projectDir) {
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "health.ts"), healthRoute);
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "stats.ts"), statsRoute);
  const authRoutes = `import { z } from 'zod';
import type { Kozo } from '@kozojs/core';
import { requireSecret } from '@kozojs/core';
import { createJWT } from '@kozojs/auth';
import { UserSchema } from '../../schemas/user.js';
import { users } from '../../data/store.js';

// Read once at module load, with no fallback \u2014 a missing JWT_SECRET fails the
// boot rather than the first login request.
const JWT_SECRET = requireSecret('JWT_SECRET');

export function registerAuthRoutes(app: Kozo) {
  // POST /auth/login \u2014 public (no JWT required)
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

  // GET /auth/me \u2014 requires valid JWT (jwtGuard handles verification)
  app.get('/auth/me', {
    response: UserSchema,
  }, (c) => {
    // user payload attached by jwtGuard \u2192 ctx.user
    const payload = c.user as { sub?: string } | null;
    return users.find(u => u.id === payload?.sub) ?? users[0];
  });
}
`;
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "auth", "index.ts"), authRoutes);
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "users", "index.ts"), userRoutes);
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
  await import_fs_extra.default.writeFile(import_node_path.default.join(projectDir, "src", "routes", "posts", "index.ts"), postRoutes);
}

// src/utils/scaffold/template-api-only.ts
var import_fs_extra2 = __toESM(require("fs-extra"));
var import_node_path2 = __toESM(require("path"));
async function scaffoldApiOnlyTemplate(projectDir, projectName, kozoCoreDep, runtime) {
  await import_fs_extra2.default.ensureDir(import_node_path2.default.join(projectDir, "src"));
  const packageJson = {
    name: projectName,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: runtime === "bun" ? "bun --watch src/index.ts" : "tsx watch src/index.ts",
      build: "tsc",
      start: runtime === "bun" ? "bun src/index.ts" : "node dist/index.js"
    },
    dependencies: {
      "@kozojs/core": kozoCoreDep,
      hono: "^4.12.5",
      zod: "^4.0.0",
      ...runtime === "node" && { "@hono/node-server": "^1.19.10" },
      ...runtime === "node" && { "uWebSockets.js": "github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df" }
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      ...runtime !== "bun" && { tsx: "^4.21.0" },
      typescript: "^5.6.0"
    }
  };
  await import_fs_extra2.default.writeJSON(import_node_path2.default.join(projectDir, "package.json"), packageJson, { spaces: 2 });
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src"
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
  };
  await import_fs_extra2.default.writeJSON(import_node_path2.default.join(projectDir, "tsconfig.json"), tsconfig, { spaces: 2 });
  const indexTs = `import { createKozo } from '@kozojs/core';
import { z } from 'zod';

const app = createKozo({ port: 3000 });

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

console.log('\u{1F525} Kozo running on http://localhost:3000');
await app.nativeListen();
`;
  await import_fs_extra2.default.writeFile(import_node_path2.default.join(projectDir, "src", "index.ts"), indexTs);
  await import_fs_extra2.default.writeFile(import_node_path2.default.join(projectDir, ".gitignore"), "node_modules/\ndist/\n.env\n");
}
async function createDockerCompose(dir, projectName, database, dbPort, includeApiService = false, runtime = "node") {
  if (database === "none" || database === "sqlite") return;
  const pgPort = dbPort ?? 5436;
  let services = "";
  if (database === "postgresql") {
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
      retries: 5
`;
    if (includeApiService) {
      const runCmd = runtime === "bun" ? "bun dist/index.js" : "node dist/index.js";
      services += `
  api:
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
    command: ${runCmd}
`;
    }
  } else if (database === "mysql") {
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
      retries: 5
`;
    if (includeApiService) {
      const runCmd = runtime === "bun" ? "bun dist/index.js" : "node dist/index.js";
      services += `
  api:
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
    command: ${runCmd}
`;
    }
  }
  const volumes = database === "postgresql" ? "\nvolumes:\n  postgres_data:\n" : database === "mysql" ? "\nvolumes:\n  mysql_data:\n" : "";
  const compose = `services:
${services}${volumes}`;
  await import_fs_extra2.default.writeFile(import_node_path2.default.join(dir, "docker-compose.yml"), compose);
}
async function createDockerfile(projectDir, runtime) {
  const dockerfile = runtime === "bun" ? `FROM oven/bun:1 AS builder
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
` : `FROM node:20-alpine AS builder
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
  await import_fs_extra2.default.writeFile(import_node_path2.default.join(projectDir, "Dockerfile"), dockerfile);
  await import_fs_extra2.default.writeFile(import_node_path2.default.join(projectDir, ".dockerignore"), "node_modules\ndist\n.git\n.env\n");
}
async function createGitHubActions(projectDir) {
  await import_fs_extra2.default.ensureDir(import_node_path2.default.join(projectDir, ".github", "workflows"));
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
  await import_fs_extra2.default.writeFile(import_node_path2.default.join(projectDir, ".github", "workflows", "ci.yml"), workflow);
}

// src/utils/scaffold/fullstack-api.ts
var import_fs_extra4 = __toESM(require("fs-extra"));
var import_node_path4 = __toESM(require("path"));

// src/utils/scaffold/fullstack-web.ts
var import_fs_extra3 = __toESM(require("fs-extra"));
var import_node_path3 = __toESM(require("path"));

// src/utils/scaffold/generators/pages.ts
function generateAppTsx(projectName, auth) {
  return `import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, Users, FileText, CheckSquare, Server, Sun, Moon${auth ? ", LogOut" : ""} } from 'lucide-react';
import { Toaster } from 'sonner';
${auth ? "import { getToken, clearToken } from '@/lib/api';" : ""}
import { useUIStore } from '@/store/ui';
import { useThemeStore } from '@/store/theme';
import PreloadSpinner from '@/components/PreloadSpinner';
${auth ? "import Login from './pages/Login';" : ""}
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import PostsPage from './pages/Posts';
import TasksPage from './pages/Tasks';

// \u2500\u2500 Routing \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
type AppPage = 'dashboard' | 'users' | 'posts' | 'tasks';
const APP_PAGES: AppPage[] = ['dashboard', 'users', 'posts', 'tasks'];
const NAV_SPINNER_MS = 300;

function parseRoute(pathname: string): AppPage {
  const clean = pathname.replace(/\\/+$/, '') || '/';
  if (clean.startsWith('/app/')) {
    const seg = clean.replace('/app/', '') as AppPage;
    return APP_PAGES.includes(seg) ? seg : 'dashboard';
  }
  return 'dashboard';
}

function buildUrl(page: AppPage): string {
  return page === 'dashboard' ? '/app' : \`/app/\${page}\`;
}

const PAGE_TITLES: Record<AppPage, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  posts: 'Posts',
  tasks: 'Tasks',
};

export default function App({ initialPath = '/' }: { initialPath?: string }) {
  const initial = useMemo(() => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : initialPath;
    return parseRoute(pathname);
  }, [initialPath]);

  const [page, setPage] = useState<AppPage>(initial);
${auth ? `  const [token, setToken] = useState<string | null>(() => getToken());` : ""}
  const queryClient = useQueryClient();
  const sidebarOpen   = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setGlobalLoading = useUIStore((s) => s.setGlobalLoading);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // All hooks must be declared before any early return
  const navigate = useCallback((p: AppPage) => {
    if (p === page) return;
    if (typeof window !== 'undefined') window.history.pushState(null, '', buildUrl(p));
    setGlobalLoading(true);
    setTimeout(() => { setPage(p); setGlobalLoading(false); }, NAV_SPINNER_MS);
  }, [page, setGlobalLoading]);

  // Sync browser back/forward
  useEffect(() => {
    const onPop = () => setPage(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Close sidebar on wider screens
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    if (mq.matches) setSidebarOpen(false);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setSidebarOpen]);

  // Update <title>
  useEffect(() => { document.title = \`\${PAGE_TITLES[page]} | ${projectName}\`; }, [page]);
${auth ? `
  const handleLogin = (t: string) => setToken(t);
  const handleLogout = () => {
    clearToken();
    setToken(null);
    queryClient.clear();
  };

  if (!token) return <Login onLogin={handleLogin} />;
` : ""}

  const nav = [
    { id: 'dashboard' as AppPage, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users' as AppPage, label: 'Users',     icon: Users },
    { id: 'posts' as AppPage, label: 'Posts',     icon: FileText },
    { id: 'tasks' as AppPage, label: 'Tasks',     icon: CheckSquare },
  ];

  const sidebar = (
    <aside
      className={\`flex flex-col h-full transition-transform md:translate-x-0 \${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }\`}
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', width: '224px' }}
    >
      <div className="flex items-center gap-2 p-5 pb-4">
        <Server className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <span className="font-bold text-sm tracking-wide" style={{ color: 'var(--fg)' }}>${projectName}</span>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { navigate(id); setSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={page === id
              ? { background: 'var(--sidebar-active-bg)', color: 'var(--sidebar-active-fg)' }
              : { color: 'var(--sidebar-fg)' }
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--sidebar-fg)' }}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4" />
            : <Moon className="w-4 h-4" />
          }
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
${auth ? `        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:text-red-400"
          style={{ color: 'var(--sidebar-fg)' }}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
` : ""}      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <PreloadSpinner />
      <Toaster position="bottom-right" richColors />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar \u2014 fixed on mobile, static on desktop */}
      <div className="hidden md:flex flex-col" style={{ width: '224px', flexShrink: 0 }}>
        {sidebar}
      </div>
      <div
        className={\`fixed inset-y-0 left-0 z-50 flex flex-col md:hidden transition-transform \${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }\`}
      >
        {sidebar}
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile topbar */}
        <header className="flex md:hidden items-center gap-3 px-4 h-14 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}>
          <button onClick={toggleSidebar} className="p-1.5 rounded-md"
            style={{ color: 'var(--fg-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-sm" style={{ color: 'var(--fg)' }}>
            {PAGE_TITLES[page]}
          </span>
        </header>
        <main className="flex-1 overflow-auto p-6 sm:p-8">
          {page === 'dashboard' && <Dashboard />}
          {page === 'users'     && <UsersPage />}
          {page === 'posts'     && <PostsPage />}
          {page === 'tasks'     && <TasksPage />}
        </main>
      </div>
    </div>
  );
}
`;
}
function generateLoginPage() {
  return `import { useState, FormEvent } from 'react';
import { Server, Loader2 } from 'lucide-react';
import { apiFetch, setToken } from '@/lib/api';

interface Props {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 200 && res.data.token) {
        setToken(res.data.token);
        onLogin(res.data.token);
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Connection failed \u2014 is the API running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <Server className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Sign in</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>to your kozo dashboard</p>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--fg-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--fg-muted)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
              required
            />
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--destructive)' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in
          </button>
        </form>
        <p className="text-center text-xs mt-4" style={{ color: 'var(--fg-subtle)' }}>
          Demo: admin@demo.com / admin123
        </p>
      </div>
    </div>
  );
}
`;
}
function generateDashboardPage() {
  return `import { useQuery } from '@tanstack/react-query';
import { healthQuery, statsQuery } from '@/lib/queries';
import { Users, FileText, CheckSquare, Zap } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--fg-muted)' }}>{label}</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--fg)' }}>{value}</p>
          {sub && <p className="text-xs mt-1" style={{ color: 'var(--fg-subtle)' }}>{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: accent + '22', color: accent }}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <div className="flex items-start justify-between">
              <div><Skeleton className="h-3 w-16 mb-3" /><Skeleton className="h-9 w-20 mb-2" /></div>
              <Skeleton className="w-10 h-10 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: health } = useQuery(healthQuery);
  const { data: stats, isLoading } = useQuery(statsQuery);

  const uptime = health?.uptime;
  const uptimeStr = uptime !== undefined
    ? uptime > 3600 ? \`\${Math.floor(uptime / 3600)}h \${Math.floor((uptime % 3600) / 60)}m\`
    : uptime > 60 ? \`\${Math.floor(uptime / 60)}m \${Math.floor(uptime % 60)}s\`
    : \`\${Math.floor(uptime)}s\`
    : '\u2014';

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>Server overview and statistics</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
        <StatCard label="Users"  value={stats?.users ?? '\u2014'} icon={Users}       accent="var(--accent-2)" />
        <StatCard label="Posts"  value={stats?.posts ?? '\u2014'}
          sub={stats ? \`\${stats.publishedPosts} published\` : undefined}
          icon={FileText}    accent="#c084fc" />
        <StatCard label="Tasks"  value={stats?.tasks ?? '\u2014'}
          sub={stats ? \`\${stats.completedTasks} completed\` : undefined}
          icon={CheckSquare} accent="#34d399" />
        <StatCard label="Uptime" value={uptimeStr}
          sub={health?.version ? \`v\${health.version}\` : undefined}
          icon={Zap}         accent="#fbbf24" />
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>API Status</h3>
        <div className="flex items-center gap-3">
          <code className="flex-1 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>
            GET /api/health
          </code>
          <span className="px-2 py-0.5 rounded text-xs font-semibold"
            style={health?.status === 'ok'
              ? { background: 'rgba(52,211,153,0.15)', color: '#34d399' }
              : { background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }
            }>
            {health?.status ?? 'pending'}
          </span>
        </div>
      </div>
    </div>
  );
}
`;
}
function generateUsersPage() {
  return `import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersQuery, type User } from '@/lib/queries';
import { apiFetch } from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

function UsersSkeleton() {
  return (
    <div>
      <div className="mb-6"><Skeleton className="h-8 w-32 mb-2" /><Skeleton className="h-4 w-24" /></div>
      <div className="card mb-4"><Skeleton className="h-5 w-28 mb-3" /><div className="flex gap-3"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-20" /></div></div>
      <div className="card">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
            <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const notify = useUIStore((s) => s.notify);
  const [form, setForm] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: users = [], isLoading } = useQuery(usersQuery);

  const createUser = async () => {
    if (!form.name || !form.email) { setError('Name and email required'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(form) });
      if (res.status >= 400) throw new Error('Failed');
      setForm({ name: '', email: '' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      notify('success', 'User created');
    } catch { setError('Failed to create user'); notify('error', 'Failed to create user'); }
    finally { setLoading(false); }
  };

  const deleteUser = async (id: string | number) => {
    await apiFetch(\`/api/users/\${id}\`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    notify('success', 'User deleted');
  };

  if (isLoading) return <UsersSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Users</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{users.length} total</p>
      </div>

      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>Add User</h3>
        <div className="flex gap-3">
          <input
            placeholder="Full name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <input
            placeholder="email@example.com"
            type="email"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <button onClick={() => void createUser()} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--destructive)' }}>{error}</p>}
      </div>

      <div className="card overflow-hidden">
        {users.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>No users yet. Add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Role</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--fg)' }}>{user.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--fg-muted)' }}>{user.email}</td>
                  <td className="px-4 py-3">
                    {user.role && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={user.role === 'admin'
                          ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
                          : { background: 'var(--bg-subtle)', color: 'var(--fg-muted)' }}>
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => void deleteUser(user.id)}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--fg-subtle)' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
`;
}
function generatePostsPage() {
  return `import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { postsQuery, type Post } from '@/lib/queries';
import { apiFetch } from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { Plus, Trash2, Loader2, Globe, Lock } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

function PostsSkeleton() {
  return (
    <div>
      <div className="mb-6"><Skeleton className="h-8 w-28 mb-2" /><Skeleton className="h-4 w-20" /></div>
      <div className="card mb-4"><Skeleton className="h-5 w-24 mb-3" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-20 w-full" /></div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card mb-3"><Skeleton className="h-5 w-3/4 mb-2" /><Skeleton className="h-4 w-full" /></div>
      ))}
    </div>
  );
}

export default function PostsPage() {
  const queryClient = useQueryClient();
  const notify = useUIStore((s) => s.notify);
  const [form, setForm] = useState({ title: '', content: '', published: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: posts = [], isLoading } = useQuery(postsQuery);

  const createPost = async () => {
    if (!form.title) { setError('Title required'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify(form) });
      if (res.status >= 400) throw new Error('Failed');
      setForm({ title: '', content: '', published: false });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      notify('success', 'Post created');
    } catch { setError('Failed to create post'); notify('error', 'Failed to create post'); }
    finally { setLoading(false); }
  };

  const deletePost = async (id: string | number) => {
    await apiFetch(\`/api/posts/\${id}\`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    notify('success', 'Post deleted');
  };

  if (isLoading) return <PostsSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Posts</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{posts.length} total</p>
      </div>

      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>New Post</h3>
        <div className="space-y-3">
          <input
            placeholder="Post title"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <textarea
            placeholder="Content (optional)"
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--fg-muted)' }}>
              <input type="checkbox" checked={form.published}
                onChange={e => setForm({ ...form, published: e.target.checked })} />
              Publish immediately
            </label>
            <button onClick={() => void createPost()} disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--destructive)' }}>{error}</p>}
      </div>

      <div className="space-y-3">
        {posts.length === 0 ? (
          <div className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No posts yet. Create one above.</div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="card flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {post.published
                    ? <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#34d399' }} />
                    : <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--fg-subtle)' }} />
                  }
                  <h3 className="font-semibold truncate text-sm" style={{ color: 'var(--fg)' }}>{post.title}</h3>
                </div>
                {post.content && (
                  <p className="text-sm line-clamp-2 mt-0.5" style={{ color: 'var(--fg-muted)' }}>{post.content}</p>
                )}
              </div>
              <button onClick={() => void deletePost(post.id)}
                className="ml-3 p-1.5 rounded transition-colors flex-shrink-0"
                style={{ color: 'var(--fg-subtle)' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
`;
}
function generateTasksPage() {
  return `import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksQuery, type Task } from '@/lib/queries';
import { apiFetch } from '@/lib/api';
import { useUIStore } from '@/store/ui';
import { Plus, Trash2, Loader2, CheckCircle2, Circle } from 'lucide-react';
import { Skeleton } from '@/components/Skeleton';

const PRIORITY_STYLE: Record<string, { background: string; color: string }> = {
  high:   { background: 'rgba(239,68,68,0.15)',  color: '#f87171' },
  medium: { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  low:    { background: 'var(--bg-subtle)',       color: 'var(--fg-muted)' },
};

function TasksSkeleton() {
  return (
    <div>
      <div className="mb-6"><Skeleton className="h-8 w-28 mb-2" /><Skeleton className="h-4 w-24" /></div>
      <div className="card mb-4"><Skeleton className="h-5 w-24 mb-3" /><div className="flex gap-3"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-20" /></div></div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3 mb-2">
          <Skeleton className="w-5 h-5 rounded-full" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const queryClient = useQueryClient();
  const notify = useUIStore((s) => s.notify);
  const [form, setForm] = useState({ title: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: tasks = [], isLoading } = useQuery(tasksQuery);

  const createTask = async () => {
    if (!form.title) { setError('Title required'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(form) });
      if (res.status >= 400) throw new Error('Failed');
      setForm({ title: '', priority: 'medium' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      notify('success', 'Task created');
    } catch { setError('Failed to create task'); notify('error', 'Failed to create task'); }
    finally { setLoading(false); }
  };

  const toggleTask = async (id: string | number) => {
    await apiFetch(\`/api/tasks/\${id}/toggle\`, { method: 'PATCH' });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const deleteTask = async (id: string | number) => {
    await apiFetch(\`/api/tasks/\${id}\`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    notify('success', 'Task deleted');
  };

  const done = tasks.filter(t => t.completed).length;

  if (isLoading) return <TasksSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Tasks</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{done}/{tasks.length} completed</p>
      </div>

      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--fg)' }}>New Task</h3>
        <div className="flex gap-3">
          <input
            placeholder="Task title"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') void createTask(); }}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          />
          <select
            value={form.priority}
            onChange={e => setForm({ ...form, priority: e.target.value as 'low' | 'medium' | 'high' })}
            className="px-3 py-2.5 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--fg)' }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button onClick={() => void createTask()} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {error && <p className="text-xs mt-2" style={{ color: 'var(--destructive)' }}>{error}</p>}
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="text-center text-sm py-8" style={{ color: 'var(--fg-muted)' }}>No tasks yet. Add one above.</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="card flex items-center justify-between py-3"
              style={{ opacity: task.completed ? 0.65 : 1 }}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button onClick={() => void toggleTask(task.id)}
                  className="flex-shrink-0 transition-colors"
                  style={{ color: task.completed ? '#34d399' : 'var(--fg-subtle)' }}>
                  {task.completed
                    ? <CheckCircle2 className="w-5 h-5" />
                    : <Circle className="w-5 h-5" />
                  }
                </button>
                <span className={\`text-sm font-medium truncate \${task.completed ? 'line-through' : ''}\`}
                  style={{ color: task.completed ? 'var(--fg-subtle)' : 'var(--fg)' }}>
                  {task.title}
                </span>
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.low}>
                  {task.priority}
                </span>
              </div>
              <button onClick={() => void deleteTask(task.id)}
                className="ml-3 p-1.5 rounded transition-colors flex-shrink-0"
                style={{ color: 'var(--fg-subtle)' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
`;
}

// src/utils/scaffold/generators/assets.ts
function generateSsrServer() {
  return `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 5173);

async function createServer() {
  const app = (await import('express')).default();

  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;

  if (!isProduction) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    const { default: sirv } = await import('sirv');
    app.use(sirv(path.join(__dirname, 'client'), { gzip: true }));
  }

  app.use('*', async (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) return next();
    try {
      const url = req.originalUrl;
      let template: string;
      let render: (url: string) => Promise<{ html: string; helmet?: { title?: string; description?: string } }>;

      if (!isProduction && vite) {
        template = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render;
      } else {
        template = fs.readFileSync(path.join(__dirname, 'client', 'index.html'), 'utf-8');
        render = (await import('./server/entry-server.js')).render;
      }

      const { html: appHtml, helmet = {} } = await render(url);
      const { title = 'App', description = '' } = helmet;

      const finalHtml = template
        .replace('<title>App</title>', \`<title>\${title}</title>\`)
        .replace('<!--description-->', description ? \`<meta name="description" content="\${description}" />\` : '')
        .replace('<!--app-html-->', appHtml);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(finalHtml);
    } catch (e) {
      vite?.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(PORT, () => {
    console.log(\`\${isProduction ? 'Production' : 'Dev'} server running at http://localhost:\${PORT}\`);
  });
}

createServer();
`;
}
function generateIndexCss(_projectName) {
  return `@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --bg: #0f0f10;
  --bg-subtle: #1a1a1e;
  --card: #18181c;
  --card-border: #2a2a30;
  --sidebar-bg: #111114;
  --fg: #e8e8ec;
  --fg-muted: #888893;
  --fg-subtle: #555560;
  --border: #27272e;
  --input-bg: #1e1e22;
  --input-border: #32323a;
  --accent: #ABF43F;
  --accent-hover: #c0ff55;
  --accent-fg: #0a0f00;
  --accent-subtle: rgba(171,244,63,0.12);
  --accent-border: rgba(171,244,63,0.3);
  --destructive: #f87171;
  --radius: 0.75rem;
}

.light {
  --bg: #f8f8fa;
  --bg-subtle: #ededf0;
  --card: #ffffff;
  --card-border: #e0e0e6;
  --sidebar-bg: #f0f0f3;
  --fg: #121214;
  --fg-muted: #555560;
  --fg-subtle: #9999a8;
  --border: #e2e2e8;
  --input-bg: #ffffff;
  --input-border: #d0d0d8;
  --accent: #4d7c00;
  --accent-hover: #3d6300;
  --accent-fg: #ffffff;
  --accent-subtle: rgba(77,124,0,0.1);
  --accent-border: rgba(77,124,0,0.3);
  --destructive: #dc2626;
  --radius: 0.75rem;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  border-color: var(--border);
}

html {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 16px;
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  min-height: 100dvh;
}

#root {
  min-height: 100dvh;
}

.card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 1rem;
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--fg-subtle); }

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: calc(var(--radius) / 2);
}
`;
}
function generateApiLib(auth) {
  const tokenHelpers = auth ? `
const TOKEN_KEY = 'token';
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => { localStorage.setItem(TOKEN_KEY, t); };
export const clearToken = (): void => { localStorage.removeItem(TOKEN_KEY); };
` : "";
  return `export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NO_BODY = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);
${tokenHelpers}
export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  ok: boolean;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (!NO_BODY.has((options.method ?? 'GET').toUpperCase())) {
    headers['Content-Type'] ??= 'application/json';
  }
${auth ? `
  const token = getToken();
  if (token) headers['Authorization'] = \`Bearer \${token}\`;
` : ""}
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:401'));
  }

  let data: T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    data = await res.json() as T;
  } else {
    data = (await res.text()) as unknown as T;
  }

  if (!res.ok) {
    throw new ApiError(res.status, \`HTTP \${res.status}\`, data);
  }

  return { data, status: res.status, ok: res.ok };
}
`;
}
function generateQueriesLib() {
  return `import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface User {
  id: string | number;
  name: string;
  email: string;
  role?: 'admin' | 'user' | string;
  createdAt?: string;
}

export interface Post {
  id: string | number;
  title: string;
  content?: string;
  published?: boolean;
  authorId?: string | number;
  createdAt?: string;
}

export interface Task {
  id: string | number;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt?: string;
}

export interface Stats {
  users: number;
  posts: number;
  tasks: number;
  completedTasks: number;
}

async function fetchList<T>(url: string): Promise<T[]> {
  const res = await apiFetch<T[] | { data: T[]; items: T[] }>(url);
  if (Array.isArray(res.data)) return res.data;
  return (res.data as { data?: T[]; items?: T[] }).data
    ?? (res.data as { data?: T[]; items?: T[] }).items
    ?? [];
}

export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: async () => {
    const res = await apiFetch<{ status: string; uptime?: number }>('/api/health');
    return res.data;
  },
  staleTime: 30_000,
});

export const statsQuery = queryOptions({
  queryKey: ['stats'],
  queryFn: async () => {
    const res = await apiFetch<Stats>('/api/stats');
    return res.data;
  },
});

export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: () => fetchList<User>('/api/users'),
});

export const postsQuery = queryOptions({
  queryKey: ['posts'],
  queryFn: () => fetchList<Post>('/api/posts'),
});

export const tasksQuery = queryOptions({
  queryKey: ['tasks'],
  queryFn: () => fetchList<Task>('/api/tasks'),
});
`;
}
function generateSkeletonComponent() {
  return `import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md', className)}
      style={{ background: 'var(--bg-subtle)' }}
    />
  );
}
`;
}
function generateEntryClient(projectName, auth) {
  return `import React from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/queryClient';
import App from './App';
import './index.css';

function revealRoot() {
  const el = document.getElementById('root');
  if (el) el.style.visibility = 'visible';
}

// Apply saved theme before first paint to avoid flash
const savedTheme = localStorage.getItem('theme-storage');
try {
  const { state } = JSON.parse(savedTheme ?? '{}') as { state?: { theme?: string } };
  if (state?.theme === 'light') {
    document.documentElement.classList.add('light');
  }
} catch { /* ignore */ }

const queryClient = createQueryClient();
const rootEl = document.getElementById('root')!;

if (rootEl.childNodes.length > 0) {
  hydrateRoot(rootEl, <React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
} else {
  createRoot(rootEl).render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
}

revealRoot();
`;
}
function generateSpaEntryClient(projectName, auth) {
  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/queryClient';
import App from './App';
import './index.css';

// Apply saved theme before first paint to avoid flash
const savedTheme = localStorage.getItem('theme-storage');
try {
  const { state } = JSON.parse(savedTheme ?? '{}') as { state?: { theme?: string } };
  if (state?.theme === 'light') {
    document.documentElement.classList.add('light');
  }
} catch { /* ignore */ }

const queryClient = createQueryClient();
const rootEl = document.getElementById('root')!;

createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

rootEl.style.visibility = 'visible';
`;
}
function generateEntryServer(projectName) {
  return `import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export interface PageMeta {
  title: string;
  description: string;
}

const PAGE_META: Record<string, PageMeta> = {
  '/':       { title: '${projectName}',         description: 'Dashboard' },
  '/users':  { title: '${projectName} \u2014 Users',  description: 'Manage users' },
  '/posts':  { title: '${projectName} \u2014 Posts',  description: 'Manage posts' },
  '/tasks':  { title: '${projectName} \u2014 Tasks',  description: 'Manage tasks' },
};

export async function render(url: string): Promise<{ html: string; helmet: PageMeta }> {
  const html = renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  const meta = PAGE_META[url] ?? PAGE_META['/'];
  return { html, helmet: meta };
}
`;
}
function generateAppTest() {
  return `import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />, { wrapper });
    expect(document.body).toBeDefined();
  });
});
`;
}

// src/utils/scaffold/fullstack-web.ts
async function scaffoldFullstackWeb(projectDir, projectName, frontend, auth = false, ssr = false) {
  const webDir = import_node_path3.default.join(projectDir, "apps", "web");
  await import_fs_extra3.default.ensureDir(import_node_path3.default.join(webDir, "src", "lib"));
  await import_fs_extra3.default.ensureDir(import_node_path3.default.join(webDir, "src", "pages"));
  await import_fs_extra3.default.ensureDir(import_node_path3.default.join(webDir, "src", "store"));
  await import_fs_extra3.default.ensureDir(import_node_path3.default.join(webDir, "src", "components"));
  await import_fs_extra3.default.ensureDir(import_node_path3.default.join(webDir, "src", "hooks"));
  await import_fs_extra3.default.ensureDir(import_node_path3.default.join(webDir, "src", "__tests__"));
  const packageJson = {
    name: `@${projectName}/web`,
    version: "1.0.0",
    type: "module",
    scripts: ssr ? {
      build: "vite build && vite build --ssr src/entry-server.tsx --outDir dist/server",
      preview: "cross-env NODE_ENV=production tsx server.ts",
      test: "vitest run",
      "test:watch": "vitest",
      "type-check": "tsc --noEmit"
    } : {
      dev: "vite",
      build: "vite build",
      test: "vitest run",
      "test:watch": "vitest",
      "type-check": "tsc --noEmit"
    },
    dependencies: {
      react: "^18.2.0",
      "react-dom": "^18.2.0",
      "@tanstack/react-query": "^5.0.0",
      "lucide-react": "^0.460.0",
      sonner: "^2.0.7",
      zustand: "^5.0.11",
      clsx: "^2.1.1",
      "tailwind-merge": "^3.5.0",
      zod: "^4.0.0",
      ...auth && { "react-hook-form": "^7.71.2", "@hookform/resolvers": "^5.2.2" }
    },
    devDependencies: {
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "@vitejs/plugin-react": "^4.7.0",
      "@tailwindcss/vite": "^4.0.0",
      tailwindcss: "^4.0.0",
      "tw-animate-css": "^1.4.0",
      typescript: "^5.6.0",
      vite: "^5.0.0",
      tsx: "^4.21.0",
      "cross-env": "^7.0.3",
      vitest: "^4.0.18",
      jsdom: "^28.1.0",
      "@testing-library/react": "^16.3.2",
      "@testing-library/jest-dom": "^6.9.1",
      "@testing-library/user-event": "^14.6.1"
    }
  };
  await import_fs_extra3.default.writeJSON(import_node_path3.default.join(webDir, "package.json"), packageJson, { spaces: 2 });
  await import_fs_extra3.default.writeJSON(import_node_path3.default.join(webDir, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2020",
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      paths: { "@/*": ["./src/*"] }
    },
    include: ["src"]
  }, { spaces: 2 });
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "vite.config.ts"), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
`);
  const rootContent = ssr ? "<!--app-html-->" : "";
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName}</title>
</head>
<body>
  <div id="root" style="visibility:hidden">${rootContent}</div>
  <script type="module" src="/src/entry-client.tsx"></script>
</body>
</html>
`);
  await import_fs_extra3.default.writeJSON(import_node_path3.default.join(webDir, "components.json"), {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false,
    tsx: true,
    tailwind: {
      config: "",
      css: "src/index.css",
      baseColor: "neutral",
      cssVariables: true,
      prefix: ""
    },
    iconLibrary: "lucide",
    rtl: false,
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks"
    },
    registries: {}
  }, { spaces: 2 });
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "vitest.config.ts"), `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`);
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "vitest.setup.ts"), `import '@testing-library/jest-dom/vitest';
`);
  if (ssr) {
    await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "server.ts"), generateSsrServer());
  }
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "index.css"), generateIndexCss(projectName));
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "lib", "api.ts"), generateApiLib(auth));
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "lib", "utils.ts"), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "lib", "queryClient.ts"), `import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api.js';

/** Never retry on auth errors \u2014 user must re-authenticate. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: shouldRetry },
    },
  });
}
`);
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "lib", "queries.ts"), generateQueriesLib());
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "store", "ui.ts"), `import { create } from 'zustand';
import { toast } from 'sonner';

interface UIState {
  globalLoading: boolean;
  setGlobalLoading: (v: boolean) => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>(() => ({
  globalLoading: false,
  setGlobalLoading: (v) => useUIStore.setState({ globalLoading: v }),
  notify: (type, message) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast.info(message);
  },
  sidebarOpen: false,
  toggleSidebar: () => useUIStore.setState((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (v) => useUIStore.setState({ sidebarOpen: v }),
}));
`);
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "store", "theme.ts"), `import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

/** Persisted theme store \u2014 applies .dark class to <html> for Tailwind v4. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => { applyThemeClass(theme); set({ theme }); },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        applyThemeClass(next);
        set({ theme: next });
      },
    }),
    {
      name: '${projectName}_theme',
      onRehydrateStorage: () => (state) => { if (state) applyThemeClass(state.theme); },
    },
  ),
);

function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
}
`);
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "components", "Skeleton.tsx"), generateSkeletonComponent());
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "components", "PreloadSpinner.tsx"), `import { useUIStore } from '@/store/ui';

/** Full-viewport spinner overlay shown while globalLoading is true. */
export default function PreloadSpinner() {
  const loading = useUIStore((s) => s.globalLoading);
  if (!loading) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '12px',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}>
        <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
        <path d="M20 4 A16 16 0 0 1 36 20" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        <style>{\`@keyframes spin { to { transform: rotate(360deg); } }\`}</style>
      </svg>
      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.02em' }}>
        Loading\u2026
      </span>
    </div>
  );
}
`);
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "entry-client.tsx"), ssr ? generateEntryClient(projectName, auth) : generateSpaEntryClient(projectName, auth));
  if (ssr) {
    await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "entry-server.tsx"), generateEntryServer(projectName));
  }
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "main.tsx"), `import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { createQueryClient } from './lib/queryClient';
import './index.css';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
`);
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "__tests__", "App.test.tsx"), generateAppTest());
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "pages", "Dashboard.tsx"), generateDashboardPage());
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "pages", "Users.tsx"), generateUsersPage());
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "pages", "Posts.tsx"), generatePostsPage());
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "pages", "Tasks.tsx"), generateTasksPage());
  if (auth) {
    await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "pages", "Login.tsx"), generateLoginPage());
  }
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(webDir, "src", "App.tsx"), generateAppTsx(projectName, auth));
}
async function scaffoldFullstackReadme(projectDir, projectName) {
  const readme = `# ${projectName}

Full-stack application built with **[Kozo](https://github.com/zazzo9039/kozo)** \u2014 React + Vite frontend with SSR support and a Kozo/Hono API backend.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite 5, TailwindCSS v4, TanStack Query v5 |
| State | Zustand (UI store + persisted theme) |
| Toasts | Sonner |
| Icons | Lucide React |
| Backend | Kozo (Hono-based), TypeScript, Zod |
| Build | tsup, pnpm workspaces |

## Project Structure

\`\`\`
apps/
\u251C\u2500\u2500 api/                       # Backend
\u2502   \u2514\u2500\u2500 src/
\u2502       \u251C\u2500\u2500 routes/            # File-system routes
\u2502       \u2502   \u251C\u2500\u2500 api/health.ts
\u2502       \u2502   \u251C\u2500\u2500 api/users/
\u2502       \u2502   \u251C\u2500\u2500 api/posts/
\u2502       \u2502   \u2514\u2500\u2500 api/tasks/
\u2502       \u2514\u2500\u2500 index.ts
\u2514\u2500\u2500 web/                       # Frontend
    \u251C\u2500\u2500 server.ts              # SSR dev/prod server
    \u2514\u2500\u2500 src/
        \u251C\u2500\u2500 App.tsx            # Router + layout
        \u251C\u2500\u2500 entry-client.tsx   # SSR-aware hydration
        \u251C\u2500\u2500 entry-server.tsx   # renderToString
        \u251C\u2500\u2500 index.css          # Design system (CSS vars)
        \u251C\u2500\u2500 lib/
        \u2502   \u251C\u2500\u2500 api.ts         # apiFetch + ApiError
        \u2502   \u251C\u2500\u2500 queries.ts     # TanStack Query registry
        \u2502   \u251C\u2500\u2500 queryClient.ts
        \u2502   \u2514\u2500\u2500 utils.ts       # cn() utility
        \u251C\u2500\u2500 store/
        \u2502   \u251C\u2500\u2500 ui.ts          # Sidebar + notify + loading
        \u2502   \u2514\u2500\u2500 theme.ts       # Persisted dark/light
        \u251C\u2500\u2500 components/
        \u2502   \u251C\u2500\u2500 Skeleton.tsx
        \u2502   \u2514\u2500\u2500 PreloadSpinner.tsx
        \u2514\u2500\u2500 pages/
            \u251C\u2500\u2500 DashboardPage.tsx
            \u251C\u2500\u2500 UsersPage.tsx
            \u251C\u2500\u2500 PostsPage.tsx
            \u2514\u2500\u2500 TasksPage.tsx
\`\`\`

## Getting Started

\`\`\`bash
pnpm install
pnpm dev            # starts both API (3000) and web (5173)
\`\`\`

## Environment Variables

\`\`\`
# apps/api/.env
PORT=3000
DATABASE_URL=postgresql://...   # if using DB

# apps/web/.env
VITE_API_URL=http://localhost:3000
\`\`\`

## API Endpoints

### Health
- \`GET /api/health\` \u2014 health check
- \`GET /api/stats\`  \u2014 aggregate statistics

### Users
- \`GET /api/users\`        \u2014 list
- \`POST /api/users\`       \u2014 create \`{ name, email }\`
- \`DELETE /api/users/:id\` \u2014 delete

### Posts
- \`GET /api/posts\`        \u2014 list (query: \`?published=true\`)
- \`POST /api/posts\`       \u2014 create \`{ title, content?, published? }\`
- \`DELETE /api/posts/:id\` \u2014 delete

### Tasks
- \`GET /api/tasks\`           \u2014 list (query: \`?completed=true\`)
- \`POST /api/tasks\`          \u2014 create \`{ title, priority? }\`
- \`PATCH /api/tasks/:id/toggle\` \u2014 toggle completion
- \`DELETE /api/tasks/:id\`    \u2014 delete

## Design System

The app uses CSS custom properties for theming (dark by default, light class-based):

| Variable | Purpose |
|----------|---------|
| \`--bg\`, \`--bg-subtle\` | backgrounds |
| \`--card\`, \`--card-border\` | card surfaces |
| \`--fg\`, \`--fg-muted\` | text |
| \`--accent\` (#ABF43F / #4d7c00) | primary CTA |
| \`--destructive\` | delete/error |

## Build

\`\`\`bash
pnpm build          # build all packages
pnpm preview        # preview SSR production build
pnpm test           # run vitest
\`\`\`
`;
  await import_fs_extra3.default.writeFile(import_node_path3.default.join(projectDir, "README.md"), readme);
}

// src/utils/scaffold/fullstack-api.ts
async function scaffoldFullstackProject(projectDir, projectName, kozoCoreDep, runtime, database, dbPort, auth, frontend, extras, template, ssr = false) {
  const hasDb = database !== "none";
  await import_fs_extra4.default.ensureDir(import_node_path4.default.join(projectDir, "apps", "api", "src", "routes"));
  await import_fs_extra4.default.ensureDir(import_node_path4.default.join(projectDir, "apps", "api", "src", "data"));
  if (hasDb) await import_fs_extra4.default.ensureDir(import_node_path4.default.join(projectDir, "apps", "api", "src", "db"));
  await import_fs_extra4.default.ensureDir(import_node_path4.default.join(projectDir, "apps", "web", "src", "lib"));
  await import_fs_extra4.default.ensureDir(import_node_path4.default.join(projectDir, ".vscode"));
  const rootPackageJson = {
    name: projectName,
    private: true,
    scripts: ssr ? {
      dev: `pnpm --filter @${projectName}/api dev`,
      build: "pnpm run --recursive build"
    } : {
      dev: "pnpm run --parallel dev",
      build: "pnpm run --recursive build"
    }
  };
  await import_fs_extra4.default.writeJSON(import_node_path4.default.join(projectDir, "package.json"), rootPackageJson, { spaces: 2 });
  await import_fs_extra4.default.writeFile(import_node_path4.default.join(projectDir, "pnpm-workspace.yaml"), `packages:
  - 'apps/*'
`);
  await import_fs_extra4.default.writeFile(import_node_path4.default.join(projectDir, ".gitignore"), "node_modules/\ndist/\n.env\n*.log\n");
  await scaffoldFullstackApi(projectDir, projectName, kozoCoreDep, runtime, database, dbPort, auth, ssr);
  await scaffoldFullstackWeb(projectDir, projectName, frontend, auth, ssr);
  await scaffoldFullstackReadme(projectDir, projectName);
  if (database !== "none" && database !== "sqlite") await createDockerCompose(projectDir, projectName, database, dbPort);
  if (extras.includes("docker")) await createDockerfile(import_node_path4.default.join(projectDir, "apps", "api"), runtime);
  if (extras.includes("github-actions")) await createGitHubActions(projectDir);
}
async function scaffoldFullstackApi(projectDir, projectName, kozoCoreDep, runtime, database = "none", dbPort, auth = true, ssr = false) {
  const apiDir = import_node_path4.default.join(projectDir, "apps", "api");
  const hasDb = database !== "none";
  if (hasDb) {
    await import_fs_extra4.default.ensureDir(import_node_path4.default.join(apiDir, "src", "db"));
    await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, "src", "db", "schema.ts"), getDatabaseSchema(database));
    await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, "src", "db", "index.ts"), getDatabaseIndex(database));
    if (database === "sqlite") {
      await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, "src", "db", "seed.ts"), getSQLiteSeed());
    }
    const dialect = database === "postgresql" ? "postgresql" : database === "mysql" ? "mysql" : "sqlite";
    const pgPort = dbPort ?? 5436;
    const dbUrl = database === "postgresql" ? `postgresql://postgres:postgres@localhost:${pgPort}/${projectName}` : database === "mysql" ? `mysql://root:root@localhost:3306/${projectName}` : void 0;
    await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, "drizzle.config.ts"), `import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${dialect}',
  dbCredentials: {
    ${database === "sqlite" ? "url: './data.db'" : "url: process.env.DATABASE_URL!"}
  },
});
`);
    const envContent = (jwtSecret) => `PORT=3000
NODE_ENV=development
${dbUrl ? `DATABASE_URL=${dbUrl}
` : ""}${auth ? `${ENV_SECRET_HELP}
JWT_SECRET=${jwtSecret}
` : ""}`;
    await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, ".env"), envContent(auth ? generateSecret() : ""));
    await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, ".env.example"), envContent(""));
  } else {
    const envContent = (jwtSecret) => `PORT=3000
NODE_ENV=development
${auth ? `${ENV_SECRET_HELP}
JWT_SECRET=${jwtSecret}
` : ""}`;
    await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, ".env"), envContent(auth ? generateSecret() : ""));
    await import_fs_extra4.default.writeFile(import_node_path4.default.join(apiDir, ".env.example"), envContent(""));
  }
  const apiPackageJson = {
    name: `@${projectName}/api`,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: runtime === "bun" ? "bun --watch src/index.ts" : "node --import tsx --watch-path=./src src/index.ts",
      build: "tsc",
      ...hasDb && {
        "db:generate": "drizzle-kit generate",
        "db:push": "drizzle-kit push",
        "db:studio": "drizzle-kit studio"
      }
    },
    dependencies: {
      "@kozojs/core": kozoCoreDep,
      ...auth && { "@kozojs/auth": kozoCoreDep === "workspace:*" ? "workspace:*" : "^0.5.21" },
      hono: "^4.12.5",
      zod: "^4.0.0",
      dotenv: "^16.4.0",
      ...runtime === "node" && { "@hono/node-server": "^1.19.10" },
      ...runtime === "node" && { "uWebSockets.js": "github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df" },
      ...hasDb && { "drizzle-orm": "^0.36.0" },
      ...database === "postgresql" && { postgres: "^3.4.8" },
      ...database === "mysql" && { mysql2: "^3.11.0" },
      ...database === "sqlite" && { "better-sqlite3": "^11.0.0" }
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      ...runtime !== "bun" && { tsx: "^4.21.0" },
      typescript: "^5.6.0",
      ...ssr && { vite: "^5.0.0", "@vitejs/plugin-react": "^4.7.0" },
      ...hasDb && { "drizzle-kit": "^0.28.0" },
      ...database === "sqlite" && { "@types/better-sqlite3": "^7.6.0" }
    }
  };
  await import_fs_extra4.default.writeJSON(import_node_path4.default.join(apiDir, "package.json"), apiPackageJson, { spaces: 2 });
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src"
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
  };
  await import_fs_extra4.default.writeJSON(import_node_path4.default.join(apiDir, "tsconfig.json"), tsconfig, { spaces: 2 });
  const authImport = auth ? `import { jwtGuard } from '@kozojs/auth';
` : "";
  const authMiddleware = auth ? `
// JWT protects all /api/* routes except public ones.
// app.guard runs on BOTH transports (listen + nativeListen) at native speed.
// requireSecret has no fallback: a missing JWT_SECRET stops the boot.
const JWT_SECRET = requireSecret('JWT_SECRET');
app.guard('/api/*', jwtGuard(JWT_SECRET, {
  publicPaths: ['/api/auth', '/api/health', '/api/stats'],
}));
` : "";
  const listenCode = ssr ? `await app.listenSsr(PORT, {
  root: join(__dirname, '../../web'),
  entryServer: 'src/entry-server.tsx',
});` : runtime === "node" ? "await app.nativeListen();" : "await app.listen();";
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "index.ts"), `import 'dotenv/config';
import { createKozo${auth ? ", requireSecret" : ""} } from '@kozojs/core';
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

console.log(\`\u{1F525} ${projectName} ${ssr ? "SSR" : "API"} on http://localhost:\${PORT}\`);
${listenCode}
`);
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "schemas", "index.ts"), `import { z } from 'zod';

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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "data", "index.ts"), `export const users = [
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "health", "get.ts"), `import { z } from 'zod';

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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "stats", "get.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "echo", "get.ts"), `import { z } from 'zod';

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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "validate", "post.ts"), `import { z } from 'zod';

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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "users", "get.ts"), `import { z } from 'zod';
import { users } from '../../../data/index.js';
import { UserSchema } from '../../../schemas/index.js';

export const schema = {
  response: z.array(UserSchema),
};

export default async () => users;
`);
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "users", "post.ts"), `import { users } from '../../../data/index.js';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "users", "[id]", "get.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "users", "[id]", "put.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "users", "[id]", "delete.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "posts", "get.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "posts", "post.ts"), `import { posts, users } from '../../../data/index.js';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "posts", "[id]", "get.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "posts", "[id]", "put.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "posts", "[id]", "delete.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "tasks", "get.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "tasks", "post.ts"), `import { tasks } from '../../../data/index.js';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "tasks", "[id]", "get.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "tasks", "[id]", "put.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "tasks", "[id]", "delete.ts"), `import { z } from 'zod';
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
  await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "tasks", "[id]", "toggle", "patch.ts"), `import { z } from 'zod';
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
  if (auth) {
    await import_fs_extra4.default.outputFile(import_node_path4.default.join(apiDir, "src", "routes", "api", "auth", "login", "post.ts"), `import { z } from 'zod';
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { requireSecret } from '@kozojs/core';
import { createJWT, UnauthorizedError } from '@kozojs/auth';

// Read once at module load, with no fallback \u2014 a missing JWT_SECRET fails the
// boot rather than the first login request.
const JWT_SECRET = requireSecret('JWT_SECRET');
const scryptAsync = promisify(scrypt);

// scrypt password hashing \u2014 no external dependency. The cost parameters are
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

// src/utils/scaffold/index.ts
async function scaffoldProject(options) {
  const { projectName, runtime, database, dbPort, auth, packageSource, template, frontend, ssr, extras } = options;
  const projectDir = import_node_path5.default.resolve(process.cwd(), projectName);
  const kozoCoreDep = packageSource === "local" ? "workspace:*" : "^0.5.21";
  if (frontend !== "none") {
    await scaffoldFullstackProject(projectDir, projectName, kozoCoreDep, runtime, database, dbPort, auth, frontend, extras, template, ssr);
    return;
  }
  if (template === "complete") {
    await scaffoldCompleteTemplate(projectDir, projectName, kozoCoreDep, runtime, database, dbPort, auth);
    if (database !== "none" && database !== "sqlite") await createDockerCompose(projectDir, projectName, database, dbPort);
    if (extras.includes("docker")) await createDockerfile(projectDir, runtime);
    if (extras.includes("github-actions")) await createGitHubActions(projectDir);
    return;
  }
  if (template === "api-only") {
    await scaffoldApiOnlyTemplate(projectDir, projectName, kozoCoreDep, runtime);
    if (extras.includes("docker")) await createDockerfile(projectDir, runtime);
    if (extras.includes("github-actions")) await createGitHubActions(projectDir);
    return;
  }
  await import_fs_extra5.default.ensureDir(import_node_path5.default.join(projectDir, "src", "routes"));
  await import_fs_extra5.default.ensureDir(import_node_path5.default.join(projectDir, "src", "db"));
  await import_fs_extra5.default.ensureDir(import_node_path5.default.join(projectDir, "src", "services"));
  const packageJson = {
    name: projectName,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
      "db:generate": "drizzle-kit generate",
      "db:push": "drizzle-kit push",
      "db:studio": "drizzle-kit studio"
    },
    dependencies: {
      "@kozojs/core": kozoCoreDep,
      "uWebSockets.js": "github:uNetworking/uWebSockets.js#6609a88ffa9a16ac5158046761356ce03250a0df",
      hono: "^4.12.5",
      zod: "^4.0.0",
      "drizzle-orm": "^0.36.0",
      ...database === "postgresql" && { postgres: "^3.4.8" },
      ...database === "mysql" && { mysql2: "^3.11.0" },
      ...database === "sqlite" && { "better-sqlite3": "^11.0.0" }
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      tsx: "^4.21.0",
      typescript: "^5.6.0",
      "drizzle-kit": "^0.28.0",
      ...database === "sqlite" && { "@types/better-sqlite3": "^7.6.0" }
    }
  };
  await import_fs_extra5.default.writeJSON(import_node_path5.default.join(projectDir, "package.json"), packageJson, { spaces: 2 });
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: "src",
      declaration: true
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
  };
  await import_fs_extra5.default.writeJSON(import_node_path5.default.join(projectDir, "tsconfig.json"), tsconfig, { spaces: 2 });
  const drizzleConfig = `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: '${database === "postgresql" ? "postgresql" : database === "mysql" ? "mysql" : "sqlite"}',
  dbCredentials: {
    ${database === "sqlite" ? "url: './data.db'" : "url: process.env.DATABASE_URL!"}
  }
});
`;
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, "drizzle.config.ts"), drizzleConfig);
  const envExample = `# Database
${database === "sqlite" ? "# SQLite uses local file, no URL needed" : "DATABASE_URL="}

# Server
PORT=3000
`;
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, ".env.example"), envExample);
  const gitignore = `node_modules/
dist/
.env
*.db
.turbo/
`;
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, ".gitignore"), gitignore);
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
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, "src", "index.ts"), indexTs);
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
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, "src", "services", "index.ts"), servicesTs);
  const schemaTs = getDatabaseSchema(database);
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, "src", "db", "schema.ts"), schemaTs);
  const dbIndexTs = getDatabaseIndex(database);
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, "src", "db", "index.ts"), dbIndexTs);
  if (database === "sqlite") {
    const seedTs = getSQLiteSeed();
    await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, "src", "db", "seed.ts"), seedTs);
  }
  await createExampleRoutes(projectDir);
  const readme = `# ${projectName}

Built with \u{1F525} **Kozo Framework**

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
\u251C\u2500\u2500 db/
\u2502   \u251C\u2500\u2500 schema.ts    # Drizzle schema
\u2502   \u251C\u2500\u2500 seed.ts      # Database initialization${database === "sqlite" ? " (SQLite)" : ""}
\u2502   \u2514\u2500\u2500 index.ts     # Database client
\u251C\u2500\u2500 routes/
\u2502   \u251C\u2500\u2500 index.ts     # GET /
\u2502   \u2514\u2500\u2500 users/
\u2502       \u251C\u2500\u2500 get.ts   # GET /users
\u2502       \u2514\u2500\u2500 post.ts  # POST /users
\u251C\u2500\u2500 services/
\u2502   \u2514\u2500\u2500 index.ts     # Service definitions
\u2514\u2500\u2500 index.ts         # Entry point
\`\`\`

## Database Commands

\`\`\`bash
pnpm db:generate  # Generate migrations
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
\`\`\`

${database === "sqlite" ? "## SQLite Notes\n\nThe database is automatically initialized with example data on first run.\nDatabase file: `./data.db`\n" : ""}
## Documentation

- [Kozo Docs](https://kozo-docs.vercel.app)
- [Drizzle ORM](https://orm.drizzle.team)
- [Hono](https://hono.dev)
`;
  await import_fs_extra5.default.writeFile(import_node_path5.default.join(projectDir, "README.md"), readme);
  if (database !== "none" && database !== "sqlite") await createDockerCompose(projectDir, projectName, database, dbPort);
  if (extras.includes("docker")) await createDockerfile(projectDir, runtime);
  if (extras.includes("github-actions")) await createGitHubActions(projectDir);
}

// src/utils/ascii-art.ts
var import_picocolors = __toESM(require("picocolors"));
var KOZO_LOGO = `
${import_picocolors.default.red(" _  __")}${import_picocolors.default.yellow("___ ")}${import_picocolors.default.red("______")}${import_picocolors.default.yellow("___ ")}
${import_picocolors.default.red("| |/ /")}${import_picocolors.default.yellow(" _ \\\\")}${import_picocolors.default.red("|_  /")}${import_picocolors.default.yellow(" _ \\\\")}
${import_picocolors.default.red("| ' /")}${import_picocolors.default.yellow(" (_) |")}${import_picocolors.default.red("/ /")}${import_picocolors.default.yellow(" (_) |")}
${import_picocolors.default.red("|_|\\_\\\\")}${import_picocolors.default.yellow("___/")}${import_picocolors.default.red("___|\\\\")}${import_picocolors.default.yellow("___/")}
`;
var KOZO_BANNER = `
${import_picocolors.default.bold(import_picocolors.default.red("\u{1F525} KOZO"))} ${import_picocolors.default.dim("- The Structure for the Edge")}
`;
function printLogo() {
  console.log(KOZO_LOGO);
}

// src/commands/new.ts
async function newCommand(projectName) {
  printLogo();
  p.intro(import_picocolors2.default.bold(import_picocolors2.default.red("\u{1F525} Create a new Kozo project")));
  const isLocalWorkspace = process.env.KOZO_LOCAL === "true";
  const project = await p.group(
    {
      name: () => {
        if (projectName) {
          if (!/^[a-z0-9-]+$/.test(projectName)) {
            p.log.error("Project name must use lowercase letters, numbers, and hyphens only");
            process.exit(1);
          }
          return Promise.resolve(projectName);
        }
        return p.text({
          message: "Project name",
          placeholder: "my-kozo-app",
          validate: (value) => {
            if (!value) return "Project name is required";
            if (!/^[a-z0-9-]+$/.test(value)) return "Use lowercase letters, numbers, and hyphens only";
          }
        });
      },
      runtime: () => p.select({
        message: "Target runtime",
        options: [
          { value: "node", label: "Node.js / Docker", hint: "Maximum compatibility (default)" },
          { value: "cloudflare", label: "Cloudflare Workers", hint: "Edge-native, global deployment" },
          { value: "bun", label: "Bun", hint: "Maximum local speed" }
        ],
        initialValue: "node"
      }),
      template: () => p.select({
        message: "Template",
        options: [
          { value: "complete", label: "Complete Server", hint: "Full production-ready app (Auth, CRUD, Stats)" },
          { value: "starter", label: "Starter", hint: "Minimal setup with database" },
          { value: "api-only", label: "API Only", hint: "Minimal, no database" }
        ]
      }),
      database: ({ results }) => {
        if (results.template === "api-only") {
          return Promise.resolve("none");
        }
        return p.select({
          message: "Database",
          options: [
            { value: "postgresql", label: "PostgreSQL + Drizzle", hint: "Standard \u2014 recommended for production" },
            { value: "mysql", label: "MySQL + Drizzle", hint: "PlanetScale compatible" },
            { value: "sqlite", label: "SQLite + Drizzle", hint: "Zero setup, great for local dev" },
            { value: "none", label: "None", hint: "In-memory store (demo only)" }
          ]
        });
      },
      dbPort: ({ results }) => {
        if (results.database !== "postgresql") return Promise.resolve(void 0);
        return p.text({
          message: "PostgreSQL port",
          placeholder: "5436",
          initialValue: "5436",
          validate: (v) => v && isNaN(Number(v)) ? "Must be a valid port number" : void 0
        });
      },
      auth: ({ results }) => {
        if (results.template === "api-only") return Promise.resolve(false);
        return p.confirm({
          message: "Include JWT authentication?",
          initialValue: true
        });
      },
      frontend: () => p.select({
        message: "Frontend",
        options: [
          { value: "none", label: "None (API only)", hint: "Backend microservice" },
          { value: "react", label: "React (Vite + TanStack Query)", hint: "Full-stack type-safe" },
          { value: "solid", label: "SolidJS (Vite)", hint: "Performance purist choice" },
          { value: "vue", label: "Vue (Vite)", hint: "Progressive framework" }
        ],
        initialValue: "none"
      }),
      ssr: ({ results }) => {
        if (results.frontend === "none") return Promise.resolve(false);
        return p.confirm({
          message: "Enable Server-Side Rendering (SSR)?",
          active: "Yes \u2014 unified server (API + SSR via listenSsr)",
          inactive: "No \u2014 SPA + API separate (Vite dev server + API)",
          initialValue: false
        });
      },
      extras: () => p.multiselect({
        message: "Extras",
        options: [
          { value: "docker", label: "Docker", hint: "Multi-stage Dockerfile" },
          { value: "github-actions", label: "GitHub Actions", hint: "CI/CD pipeline" }
        ],
        required: false
      }),
      install: () => Promise.resolve(true)
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled");
        process.exit(0);
      }
    }
  );
  const s = p.spinner();
  s.start("Creating project structure...");
  try {
    await scaffoldProject({
      projectName: project.name,
      runtime: project.runtime,
      template: project.template,
      database: project.database ?? "none",
      dbPort: project.dbPort ? Number(project.dbPort) : void 0,
      auth: project.auth,
      frontend: project.frontend,
      ssr: project.ssr,
      extras: project.extras,
      packageSource: isLocalWorkspace ? "local" : "npm"
    });
    s.stop("Project structure created!");
  } catch (err) {
    s.stop("Failed to create project");
    p.log.error(String(err));
    process.exit(1);
  }
  if (project.install) {
    s.start("Installing dependencies...");
    try {
      await (0, import_execa.execa)("pnpm", ["install"], {
        cwd: project.name,
        stdio: "pipe"
      });
      s.stop("Dependencies installed!");
    } catch {
      try {
        await (0, import_execa.execa)("npm", ["install"], {
          cwd: project.name,
          stdio: "pipe"
        });
        s.stop("Dependencies installed!");
      } catch (err) {
        s.stop("Failed to install dependencies");
        p.log.warn("Run `pnpm install` or `npm install` manually");
      }
    }
  }
  p.outro(import_picocolors2.default.green("\u2728 Project ready!"));
  console.log(`
${import_picocolors2.default.bold("Next steps:")}

  ${import_picocolors2.default.cyan(`cd ${project.name}`)}
  ${!project.install ? import_picocolors2.default.cyan("pnpm install") + "\n  " : ""}${import_picocolors2.default.cyan("pnpm dev")}

${import_picocolors2.default.dim("Documentation:")} ${import_picocolors2.default.underline("https://kozo-docs.vercel.app")}
`);
}

// src/commands/build.ts
var import_execa2 = require("execa");
var import_picocolors3 = __toESM(require("picocolors"));
var import_fs_extra6 = __toESM(require("fs-extra"));
var import_node_path8 = __toESM(require("path"));

// src/routing/manifest.ts
var import_node_crypto2 = require("crypto");
var import_node_fs2 = require("fs");
var import_node_path7 = require("path");
var import_glob2 = require("glob");

// src/routing/scan.ts
var import_glob = require("glob");
var import_node_path6 = require("path");
var import_node_fs = require("fs");
var HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
function normalizeRouteFilePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
function fileToRoute(filePath) {
  const normalized = normalizeRouteFilePath(filePath);
  const lastDot = normalized.lastIndexOf(".");
  const withoutExt = lastDot !== -1 ? normalized.slice(0, lastDot) : normalized;
  const parts = withoutExt.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1].toLowerCase();
  let method = "get";
  let includeLast = true;
  if (HTTP_METHODS.includes(last)) {
    method = last;
    includeLast = false;
  } else if (last === "index") {
    includeLast = false;
  }
  const segments = includeLast ? parts : parts.slice(0, -1);
  const urlSegments = segments.map((seg) => {
    if (seg.startsWith("[...") && seg.endsWith("]")) return "*";
    if (seg.startsWith("[") && seg.endsWith("]")) return ":" + seg.slice(1, -1);
    return seg;
  });
  const path15 = "/" + urlSegments.join("/");
  return { path: path15, method };
}
function extractParams(urlPath) {
  return urlPath.split("/").filter((seg) => seg.startsWith(":")).map((seg) => seg.slice(1));
}
function isRouteFile(file) {
  const name = file.split("/").pop() ?? "";
  if (name.startsWith("_")) return false;
  if (name.includes(".test.") || name.includes(".spec.")) return false;
  return true;
}
function detectSchemas(absolutePath) {
  let source = "";
  try {
    source = (0, import_node_fs.readFileSync)(absolutePath, "utf8");
  } catch {
    return { hasBodySchema: false, hasQuerySchema: false };
  }
  const hasBodySchema = /export\s+(const|let|var)\s+body(Schema)?\s*[=:]/.test(source) || /export\s+\{[^}]*\bbody(Schema)?\b[^}]*\}/.test(source);
  const hasQuerySchema = /export\s+(const|let|var)\s+query(Schema)?\s*[=:]/.test(source) || /export\s+\{[^}]*\bquery(Schema)?\b[^}]*\}/.test(source);
  return { hasBodySchema, hasQuerySchema };
}
function routeScore(urlPath) {
  const segments = urlPath.split("/").filter(Boolean);
  let score = segments.length * 10;
  for (const seg of segments) {
    if (seg === "*") score -= 100;
    else if (seg.startsWith(":")) score -= 5;
    else score += 1;
  }
  return score;
}
async function scanRoutes(options) {
  const { routesDir, verbose = false } = options;
  const files = await (0, import_glob.glob)("**/*.{ts,js}", {
    cwd: routesDir,
    nodir: true,
    ignore: ["**/_*.ts", "**/_*.js", "**/*.test.ts", "**/*.spec.ts", "**/*.test.js", "**/*.spec.js"]
  });
  const routes = [];
  for (const file of files) {
    if (!isRouteFile(file)) continue;
    const parsed = fileToRoute(file);
    if (!parsed) continue;
    const absolutePath = (0, import_node_path6.join)(routesDir, file);
    const { hasBodySchema, hasQuerySchema } = detectSchemas(absolutePath);
    const params = extractParams(parsed.path);
    routes.push({
      path: parsed.path,
      method: parsed.method,
      handler: absolutePath,
      relativePath: normalizeRouteFilePath(file),
      params,
      hasBodySchema,
      hasQuerySchema
    });
  }
  routes.sort((a, b) => routeScore(b.path) - routeScore(a.path));
  if (verbose) {
    for (const r of routes) {
      const method = r.method.toUpperCase().padEnd(6);
      console.log(`  ${method} ${r.path}  (${r.relativePath})`);
    }
  }
  return routes;
}
async function scanMiddleware(options) {
  const { routesDir, verbose = false } = options;
  const files = await (0, import_glob.glob)("**/_middleware.{ts,js}", {
    cwd: routesDir,
    nodir: true
  });
  const middlewares = files.map((file) => {
    const normalized = normalizeRouteFilePath(file);
    const dir = normalized.replace(/\/_middleware\.(ts|js)$/, "").replace(/_middleware\.(ts|js)$/, "");
    const pathPrefix = dir ? `/${dir}/*` : "/*";
    return {
      pathPrefix,
      handler: (0, import_node_path6.join)(routesDir, file),
      relativePath: normalized
    };
  });
  middlewares.sort((a, b) => {
    const depthA = a.pathPrefix.split("/").length;
    const depthB = b.pathPrefix.split("/").length;
    return depthA - depthB;
  });
  if (verbose) {
    for (const mw of middlewares) {
      console.log(`  \u{1F6E1}\uFE0F  ${mw.pathPrefix.padEnd(30)} (${mw.relativePath})`);
    }
  }
  return middlewares;
}

// src/routing/manifest.ts
async function hashRouteFiles(routesDir) {
  const routeFiles = await (0, import_glob2.glob)("**/*.{ts,js}", {
    cwd: routesDir,
    nodir: true,
    ignore: ["**/_*.ts", "**/_*.js", "**/*.test.ts", "**/*.spec.ts", "**/*.test.js", "**/*.spec.js"]
  });
  const middlewareFiles = await (0, import_glob2.glob)("**/_middleware.{ts,js}", {
    cwd: routesDir,
    nodir: true
  });
  const files = [.../* @__PURE__ */ new Set([...routeFiles, ...middlewareFiles])];
  files.sort();
  const hash = (0, import_node_crypto2.createHash)("sha256");
  for (const file of files) {
    hash.update(file);
    try {
      const content = (0, import_node_fs2.readFileSync)((0, import_node_path7.join)(routesDir, file));
      hash.update(content);
    } catch {
    }
  }
  return hash.digest("hex");
}
function readExistingManifest(manifestPath) {
  if (!(0, import_node_fs2.existsSync)(manifestPath)) return null;
  try {
    const raw = (0, import_node_fs2.readFileSync)(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function generateManifest(options) {
  const {
    routesDir,
    projectRoot,
    outputPath = (0, import_node_path7.join)(projectRoot, "routes-manifest.json"),
    cache = true,
    verbose = false
  } = options;
  const contentHash = await hashRouteFiles(routesDir);
  if (cache) {
    const existing = readExistingManifest(outputPath);
    if (existing && existing.contentHash === contentHash && existing.version === MANIFEST_VERSION) {
      if (verbose) {
        console.log(`  \u2713 routes-manifest.json up-to-date (hash: ${contentHash.slice(0, 8)}\u2026)`);
      }
      return existing;
    }
  }
  if (verbose) {
    console.log(`  Scanning routes in: ${routesDir}`);
  }
  const scanned = await scanRoutes({ routesDir, verbose: false });
  const scannedMiddleware = await scanMiddleware({ routesDir, verbose: false });
  const entries = scanned.map((r) => ({
    path: r.path,
    method: r.method,
    handler: r.relativePath,
    // relative to routesDir; callers can join with projectRoot
    params: r.params,
    hasBodySchema: r.hasBodySchema,
    hasQuerySchema: r.hasQuerySchema
  }));
  const middlewareEntries = scannedMiddleware.map((m) => ({
    pathPrefix: m.pathPrefix,
    handler: m.relativePath
  }));
  const manifest = {
    version: MANIFEST_VERSION,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    contentHash,
    routes: entries,
    middleware: middlewareEntries
  };
  const dir = (0, import_node_path7.dirname)(outputPath);
  if (!(0, import_node_fs2.existsSync)(dir)) {
    (0, import_node_fs2.mkdirSync)(dir, { recursive: true });
  }
  (0, import_node_fs2.writeFileSync)(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  if (verbose) {
    console.log(`  \u2713 Generated routes-manifest.json (${entries.length} routes, ${middlewareEntries.length} middleware, hash: ${contentHash.slice(0, 8)}\u2026)`);
  }
  return manifest;
}
var MANIFEST_VERSION = 2;

// src/commands/build.ts
function printBox(title) {
  const width = 50;
  const pad = Math.max(0, Math.floor((width - title.length) / 2));
  const line = "\u2500".repeat(width);
  console.log(import_picocolors3.default.cyan(`\u250C${line}\u2510`));
  console.log(import_picocolors3.default.cyan("\u2502") + " ".repeat(pad) + import_picocolors3.default.bold(title) + " ".repeat(width - pad - title.length) + import_picocolors3.default.cyan("\u2502"));
  console.log(import_picocolors3.default.cyan(`\u2514${line}\u2518`));
  console.log();
}
function step(n, total, label) {
  console.log(import_picocolors3.default.dim(`[${n}/${total}]`) + " " + import_picocolors3.default.cyan("\u2192") + " " + label);
}
function ok(label) {
  console.log(import_picocolors3.default.green("  \u2713") + " " + label);
}
function fail(label, err) {
  console.log(import_picocolors3.default.red("  \u2717") + " " + label);
  if (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(import_picocolors3.default.dim("    " + msg));
  }
}
async function buildCommand(options = {}) {
  console.clear();
  printBox("Kozo Build");
  const cwd = process.cwd();
  const TOTAL_STEPS = options.noManifest ? 3 : 4;
  let currentStep = 0;
  currentStep++;
  step(currentStep, TOTAL_STEPS, "Checking project structure\u2026");
  if (!import_fs_extra6.default.existsSync(import_node_path8.default.join(cwd, "package.json"))) {
    fail("No package.json found. Run this command inside a Kozo project.");
    process.exit(1);
  }
  if (!import_fs_extra6.default.existsSync(import_node_path8.default.join(cwd, "node_modules"))) {
    fail("Dependencies not installed. Run `npm install` first.");
    process.exit(1);
  }
  ok("Project structure OK");
  currentStep++;
  step(currentStep, TOTAL_STEPS, "Cleaning previous build\u2026");
  try {
    await import_fs_extra6.default.remove(import_node_path8.default.join(cwd, "dist"));
    ok("dist/ cleaned");
  } catch (err) {
    fail("Failed to clean dist/", err);
    process.exit(1);
  }
  if (!options.noManifest) {
    currentStep++;
    step(currentStep, TOTAL_STEPS, "Generating routes manifest\u2026");
    const routesDirRel = options.routesDir ?? "src/routes";
    const routesDirAbs = import_node_path8.default.join(cwd, routesDirRel);
    if (!import_fs_extra6.default.existsSync(routesDirAbs)) {
      console.log(import_picocolors3.default.dim(`  \u26A0  Routes directory not found (${routesDirRel}), skipping manifest.`));
    } else {
      try {
        const manifestOutAbs = options.manifestOut ? import_node_path8.default.join(cwd, options.manifestOut) : import_node_path8.default.join(cwd, "routes-manifest.json");
        const manifest = await generateManifest({
          routesDir: routesDirAbs,
          projectRoot: cwd,
          outputPath: manifestOutAbs,
          cache: !options.forceManifest,
          verbose: true
        });
        ok(`Manifest ready \u2014 ${manifest.routes.length} route(s)`);
      } catch (err) {
        fail("Manifest generation failed", err);
        console.log(import_picocolors3.default.dim("  Continuing build without manifest\u2026"));
      }
    }
  }
  currentStep++;
  step(currentStep, TOTAL_STEPS, "Compiling with tsup\u2026");
  try {
    const tsupArgs = ["tsup", ...options.tsupArgs ?? []];
    await (0, import_execa2.execa)("npx", tsupArgs, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" }
    });
    ok("Compilation complete");
  } catch (err) {
    fail("tsup compilation failed", err);
    process.exit(1);
  }
  console.log();
  console.log(import_picocolors3.default.green("\u2705  Build successful"));
  console.log();
}

// src/commands/dev.ts
var import_child_process = require("child_process");
var import_chokidar = __toESM(require("chokidar"));
var import_picocolors4 = __toESM(require("picocolors"));
var import_fs_extra8 = __toESM(require("fs-extra"));
var import_path = __toESM(require("path"));

// src/kozo/types.ts
var import_fs_extra7 = __toESM(require("fs-extra"));
var import_node_path9 = __toESM(require("path"));
var import_node_url = require("url");
var import_core = require("@kozojs/core");
async function resolveKozoConfig(cwd = process.cwd()) {
  for (const rel of import_core.KOZO_CONFIG_CANDIDATES) {
    const configPath = import_node_path9.default.join(cwd, rel);
    if (!await import_fs_extra7.default.pathExists(configPath)) continue;
    const mod = await import((0, import_node_url.pathToFileURL)(configPath).href);
    const definition = mod.default ?? mod.kozoApp;
    if (!definition?.types || typeof definition.build !== "function") continue;
    return { configPath, definition };
  }
  return null;
}
async function resolveKozoTypesRef(cwd) {
  for (const rel of import_core.KOZO_TYPES_CANDIDATES) {
    const full = import_node_path9.default.join(cwd, rel);
    if (!await import_fs_extra7.default.pathExists(full)) continue;
    const mod = await import((0, import_node_url.pathToFileURL)(full).href);
    const ref = mod.kozoTypes ?? mod.default;
    if (ref?.from && ref?.name) return ref;
  }
  const fromConfig = await resolveKozoConfig(cwd);
  return fromConfig?.definition.types ?? null;
}
async function generateKozoTypes(cwd = process.cwd()) {
  const types = await resolveKozoTypesRef(cwd);
  if (!types) return null;
  const outPath = import_node_path9.default.join(cwd, import_core.KOZO_TYPES_OUTPUT);
  await import_fs_extra7.default.ensureDir(import_node_path9.default.dirname(outPath));
  const source = await (0, import_core.renderKozoTypesDts)(types, cwd);
  await import_fs_extra7.default.writeFile(outPath, source, "utf8");
  return outPath;
}
async function resolveBuildApp(cwd = process.cwd()) {
  const fromConfig = await resolveKozoConfig(cwd);
  if (fromConfig) return () => fromConfig.definition.build();
  const legacy = ["src/app.ts", "src/app.js", "src/index.ts", "src/index.js"];
  for (const rel of legacy) {
    const full = import_node_path9.default.join(cwd, rel);
    if (!await import_fs_extra7.default.pathExists(full)) continue;
    const mod = await import((0, import_node_url.pathToFileURL)(full).href);
    const buildApp = mod.buildApp ?? mod.default?.build ?? mod.default;
    if (typeof buildApp === "function") return buildApp;
  }
  return null;
}

// src/commands/dev.ts
async function devCommand() {
  console.clear();
  printBox2("Kozo Development Server");
  await runStep(1, 4, "Checking project structure...", async () => {
    if (!import_fs_extra8.default.existsSync(import_path.default.join(process.cwd(), "package.json"))) {
      throw new Error("No package.json found. Run this command in a Kozo project.");
    }
  });
  await runStep(2, 4, "Checking dependencies...", async () => {
    if (!import_fs_extra8.default.existsSync(import_path.default.join(process.cwd(), "node_modules"))) {
      throw new Error("Dependencies not installed. Run: pnpm install");
    }
  });
  await runStep(3, 4, "Generating route types...", async () => {
    await generateKozoTypes(process.cwd());
  });
  const routesDir = resolveRoutesDir(process.cwd());
  await runStep(4, 4, "Scanning routes...", async () => {
    if (routesDir) {
      await generateManifest({ routesDir, projectRoot: process.cwd(), cache: false, verbose: false });
    }
  });
  const entry = resolveEntry(process.cwd());
  if (!entry) {
    console.error(import_picocolors4.default.red('\n\u274C No dev entry found. Expected src/index.ts, src/main.ts, src/server.ts or index.ts (or a source-file "main" in package.json).'));
    process.exit(1);
  }
  const entryRel = import_path.default.relative(process.cwd(), entry);
  console.log(import_picocolors4.default.gray(`
\u2139  Starting ${import_picocolors4.default.bold(entryRel)} (tsx watch) \u2014 the app prints its own URL.`));
  console.log(import_picocolors4.default.gray("\u{1F440} Watching for file changes... (Ctrl+C to stop)\n"));
  console.log(import_picocolors4.default.dim("\u2500".repeat(50)) + "\n");
  const child = (0, import_child_process.spawn)("npx", ["tsx", "watch", entryRel], {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "1" }
  });
  child.on("error", (err) => {
    console.error(import_picocolors4.default.red("\n\u274C Failed to start server"));
    console.error(err);
    process.exit(1);
  });
  child.on("close", (code) => {
    if (code === 0 || code === null) {
      console.log("\n" + import_picocolors4.default.dim("Server stopped"));
    }
    process.exit(code ?? 0);
  });
  if (routesDir) {
    startRouteWatcher(routesDir);
  }
  process.on("SIGINT", () => {
    console.log("\n" + import_picocolors4.default.yellow("\u23F9  Stopping Kozo dev server..."));
    child.kill("SIGTERM");
    process.exit(0);
  });
}
function startRouteWatcher(routesDir) {
  let debounceTimer = null;
  const watcher = import_chokidar.default.watch(routesDir, {
    ignored: /(^|[/\\])\..|(\.test\.[tj]s$)|(\.spec\.[tj]s$)/,
    persistent: true,
    ignoreInitial: true,
    // don't fire for files already present at startup
    awaitWriteFinish: {
      stabilityThreshold: 80,
      pollInterval: 50
    }
  });
  const handleChange = (eventType, filePath) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const manifest = await generateManifest({
          routesDir,
          projectRoot: process.cwd(),
          cache: false,
          // always regenerate on file change
          verbose: false
        });
        const count = manifest.routes.length;
        console.log(
          import_picocolors4.default.cyan("[Kozo]") + " \u2728 Routes updated " + import_picocolors4.default.dim(`(${count} found)`) + import_picocolors4.default.dim(` \u2014 ${import_path.default.relative(process.cwd(), filePath)}`)
        );
      } catch (err) {
        console.error(
          import_picocolors4.default.red("[Kozo] \u274C Failed to regenerate routes manifest:"),
          err.message
        );
      }
    }, 120);
  };
  watcher.on("add", (p3) => handleChange("add", p3)).on("change", (p3) => handleChange("change", p3)).on("unlink", (p3) => handleChange("unlink", p3)).on("error", (err) => console.error(import_picocolors4.default.red("[Kozo] Watcher error:"), err));
  return watcher;
}
function resolveRoutesDir(cwd) {
  const candidates = [
    import_path.default.join(cwd, "src", "routes"),
    import_path.default.join(cwd, "routes"),
    import_path.default.join(cwd, "src", "app", "routes"),
    import_path.default.join(cwd, "app", "routes")
  ];
  for (const candidate of candidates) {
    if (import_fs_extra8.default.existsSync(candidate) && import_fs_extra8.default.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}
function resolveEntry(cwd) {
  try {
    const pkg = JSON.parse(import_fs_extra8.default.readFileSync(import_path.default.join(cwd, "package.json"), "utf-8"));
    for (const field of [pkg.main, pkg.module]) {
      if (typeof field === "string" && /\.(t|j)sx?$/.test(field)) {
        const p3 = import_path.default.join(cwd, field);
        if (import_fs_extra8.default.existsSync(p3)) return p3;
      }
    }
  } catch {
  }
  const candidates = ["src/index.ts", "src/main.ts", "src/server.ts", "index.ts", "src/index.js"];
  for (const c of candidates) {
    const p3 = import_path.default.join(cwd, c);
    if (import_fs_extra8.default.existsSync(p3)) return p3;
  }
  return null;
}
function printBox2(title) {
  const width = 50;
  const pad = Math.floor((width - title.length) / 2);
  const line = "\u2500".repeat(width);
  console.log(import_picocolors4.default.cyan("\u250C" + line + "\u2510"));
  console.log(import_picocolors4.default.cyan("\u2502") + " ".repeat(pad) + import_picocolors4.default.bold(title) + " ".repeat(width - pad - title.length) + import_picocolors4.default.cyan("\u2502"));
  console.log(import_picocolors4.default.cyan("\u2514" + line + "\u2518"));
  console.log();
}
async function runStep(step2, total, label, fn) {
  const prefix = import_picocolors4.default.dim(`[${step2}/${total}]`);
  process.stdout.write(`${prefix} ${label}`);
  try {
    await fn();
    process.stdout.write(" " + import_picocolors4.default.green("\u2713") + "\n");
  } catch (err) {
    process.stdout.write(" " + import_picocolors4.default.red("\u2717") + "\n");
    console.error(import_picocolors4.default.red(`
  Error: ${err.message}`));
    process.exit(1);
  }
}

// src/commands/generate.ts
var p2 = __toESM(require("@clack/prompts"));
var import_picocolors5 = __toESM(require("picocolors"));
var import_fs_extra9 = __toESM(require("fs-extra"));
var import_node_path10 = __toESM(require("path"));
var ROUTE_TEMPLATE = `import { z } from 'zod';
import type { KozoContext } from '@kozojs/core';

export const schema = {
  body: z.object({
    // Define your schema here
  }),
};

export default async (ctx: KozoContext<typeof schema>) => {
  const { body, services } = ctx;
  // TODO: Implement handler
  return { message: 'Not implemented' };
};
`;
var GET_ROUTE_TEMPLATE = `import type { KozoContext } from '@kozojs/core';

export default async (ctx: KozoContext) => {
  const { params, services } = ctx;
  // TODO: Implement handler
  return { message: 'Not implemented' };
};
`;
var MIDDLEWARE_TEMPLATE = `import type { Context, Next } from 'hono';

export async function {{name}}(c: Context, next: Next) {
  // Before handler
  console.log('{{name}} middleware - before');
  
  await next();
  
  // After handler
  console.log('{{name}} middleware - after');
}
`;
var DIR_MIDDLEWARE_TEMPLATE = `import type { Context, Next } from 'hono';

/**
 * Per-directory middleware \u2014 applies to all routes in this directory and below.
 * Place this file as _middleware.ts in any route directory.
 */
export default async function (c: Context, next: Next) {
  // Before handler \u2014 add auth checks, logging, etc.
  
  await next();
  
  // After handler
}
`;
var SERVICE_TEMPLATE = `/**
 * {{Name}} service
 *
 * Register in your app:
 *   import { {{name}}Service } from './services/{{name}}';
 *   const app = createKozo({ services: { {{name}}: {{name}}Service } });
 */

export interface {{Name}}Service {
  // Define your service methods here
}

export function create{{Name}}Service(): {{Name}}Service {
  return {
    // Implement your service methods here
  };
}

export const {{name}}Service = create{{Name}}Service();
`;
async function generateCommand(type, name) {
  if (!type) {
    p2.log.error("Please specify what to generate: route, middleware, dir-middleware, service");
    process.exit(1);
  }
  switch (type.toLowerCase()) {
    case "route":
    case "r":
      await generateRoute(name);
      break;
    case "middleware":
    case "mw":
      await generateMiddleware(name);
      break;
    case "dir-middleware":
    case "dmw":
      await generateDirMiddleware(name);
      break;
    case "service":
    case "s":
      await generateService(name);
      break;
    default:
      p2.log.error(`Unknown generator: ${type}`);
      p2.log.info("Available: route, middleware, dir-middleware, service");
      process.exit(1);
  }
}
async function generateRoute(routePath) {
  let targetPath = routePath;
  if (!targetPath) {
    const result = await p2.text({
      message: "Route path (e.g., users/profile)",
      placeholder: "users/[id]",
      validate: (v) => !v ? "Path is required" : void 0
    });
    if (p2.isCancel(result)) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
    targetPath = result;
  }
  const method = await p2.select({
    message: "HTTP method",
    options: [
      { value: "get", label: "GET" },
      { value: "post", label: "POST" },
      { value: "put", label: "PUT" },
      { value: "patch", label: "PATCH" },
      { value: "delete", label: "DELETE" }
    ]
  });
  if (p2.isCancel(method)) {
    p2.cancel("Cancelled");
    process.exit(0);
  }
  const routesDir = import_node_path10.default.join(process.cwd(), "src", "routes");
  const filePath = import_node_path10.default.join(routesDir, targetPath, `${method}.ts`);
  if (await import_fs_extra9.default.pathExists(filePath)) {
    const overwrite = await p2.confirm({
      message: `File ${filePath} already exists. Overwrite?`,
      initialValue: false
    });
    if (p2.isCancel(overwrite) || !overwrite) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
  }
  await import_fs_extra9.default.ensureDir(import_node_path10.default.dirname(filePath));
  const template = method === "get" ? GET_ROUTE_TEMPLATE : ROUTE_TEMPLATE;
  await import_fs_extra9.default.writeFile(filePath, template);
  const relativePath = import_node_path10.default.relative(process.cwd(), filePath);
  p2.log.success(`Created ${import_picocolors5.default.cyan(relativePath)}`);
  const urlPath = "/" + targetPath.replace(/\[([^\]]+)\]/g, ":$1");
  console.log(`
  ${import_picocolors5.default.bold(String(method).toUpperCase())} ${import_picocolors5.default.green(urlPath)}
`);
}
async function generateMiddleware(middlewareName) {
  let name = middlewareName;
  if (!name) {
    const result = await p2.text({
      message: "Middleware name",
      placeholder: "auth",
      validate: (v) => !v ? "Name is required" : void 0
    });
    if (p2.isCancel(result)) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
    name = result;
  }
  const middlewareDir = import_node_path10.default.join(process.cwd(), "src", "middleware");
  const filePath = import_node_path10.default.join(middlewareDir, `${name}.ts`);
  if (await import_fs_extra9.default.pathExists(filePath)) {
    const overwrite = await p2.confirm({
      message: `File ${filePath} already exists. Overwrite?`,
      initialValue: false
    });
    if (p2.isCancel(overwrite) || !overwrite) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
  }
  await import_fs_extra9.default.ensureDir(middlewareDir);
  const content = MIDDLEWARE_TEMPLATE.replace(/\{\{name\}\}/g, name);
  await import_fs_extra9.default.writeFile(filePath, content);
  const relativePath = import_node_path10.default.relative(process.cwd(), filePath);
  p2.log.success(`Created ${import_picocolors5.default.cyan(relativePath)}`);
}
async function generateDirMiddleware(routePath) {
  let targetPath = routePath;
  if (!targetPath) {
    const result = await p2.text({
      message: "Route directory (e.g., admin, api/v2)",
      placeholder: "admin",
      validate: (v) => !v ? "Path is required" : void 0
    });
    if (p2.isCancel(result)) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
    targetPath = result;
  }
  const routesDir = import_node_path10.default.join(process.cwd(), "src", "routes");
  const filePath = import_node_path10.default.join(routesDir, targetPath, "_middleware.ts");
  if (await import_fs_extra9.default.pathExists(filePath)) {
    const overwrite = await p2.confirm({
      message: `File ${import_node_path10.default.relative(process.cwd(), filePath)} already exists. Overwrite?`,
      initialValue: false
    });
    if (p2.isCancel(overwrite) || !overwrite) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
  }
  await import_fs_extra9.default.ensureDir(import_node_path10.default.dirname(filePath));
  await import_fs_extra9.default.writeFile(filePath, DIR_MIDDLEWARE_TEMPLATE);
  const relativePath = import_node_path10.default.relative(process.cwd(), filePath);
  p2.log.success(`Created ${import_picocolors5.default.cyan(relativePath)}`);
  const urlPrefix = "/" + targetPath.replace(/\\/g, "/") + "/*";
  console.log(`
  \u{1F6E1}\uFE0F  Applies to: ${import_picocolors5.default.green(urlPrefix)}
`);
}
async function generateService(serviceName) {
  let name = serviceName;
  if (!name) {
    const result = await p2.text({
      message: "Service name (e.g., email, payment)",
      placeholder: "email",
      validate: (v) => !v ? "Name is required" : void 0
    });
    if (p2.isCancel(result)) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
    name = result;
  }
  const servicesDir = import_node_path10.default.join(process.cwd(), "src", "services");
  const filePath = import_node_path10.default.join(servicesDir, `${name}.ts`);
  if (await import_fs_extra9.default.pathExists(filePath)) {
    const overwrite = await p2.confirm({
      message: `File ${import_node_path10.default.relative(process.cwd(), filePath)} already exists. Overwrite?`,
      initialValue: false
    });
    if (p2.isCancel(overwrite) || !overwrite) {
      p2.cancel("Cancelled");
      process.exit(0);
    }
  }
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  await import_fs_extra9.default.ensureDir(servicesDir);
  const content = SERVICE_TEMPLATE.replace(/\{\{name\}\}/g, name).replace(/\{\{Name\}\}/g, capitalized);
  await import_fs_extra9.default.writeFile(filePath, content);
  const relativePath = import_node_path10.default.relative(process.cwd(), filePath);
  p2.log.success(`Created ${import_picocolors5.default.cyan(relativePath)}`);
  console.log(`
  Register in your app:
  ${import_picocolors5.default.dim(`services: { ${name}: ${name}Service }`)}
`);
}

// src/commands/routes.ts
var import_picocolors6 = __toESM(require("picocolors"));
var import_fs_extra10 = __toESM(require("fs-extra"));
var import_node_path11 = __toESM(require("path"));
var import_node_fs3 = require("fs");
function readMeta(handlerPath) {
  try {
    const src = (0, import_node_fs3.readFileSync)(handlerPath, "utf8");
    const authFalse = /meta\s*=\s*\{[^}]*auth\s*:\s*false/.test(src);
    const authTrue = /meta\s*=\s*\{[^}]*auth\s*:\s*true/.test(src);
    const tagsMatch = src.match(/tags\s*:\s*\[([^\]]*)\]/);
    const tags = tagsMatch ? tagsMatch[1].split(",").map((t) => t.replace(/['"`\s]/g, "")).filter(Boolean) : void 0;
    return {
      auth: authFalse ? false : authTrue ? true : void 0,
      tags
    };
  } catch {
    return void 0;
  }
}
async function routesCommand(opts) {
  const cwd = process.cwd();
  const routesDir = opts.routesDir ? import_node_path11.default.resolve(cwd, opts.routesDir) : resolveRoutesDir(cwd);
  if (!routesDir || !await import_fs_extra10.default.pathExists(routesDir)) {
    console.error(import_picocolors6.default.red("No routes directory found."));
    console.error(import_picocolors6.default.dim("Looked for src/routes, routes, src/app/routes, app/routes"));
    console.error(import_picocolors6.default.dim("Or pass --routes-dir <path>"));
    process.exit(1);
  }
  const routes = await scanRoutes({ routesDir, verbose: false });
  if (routes.length === 0) {
    console.log(import_picocolors6.default.yellow("No routes found in"), routesDir);
    return;
  }
  console.log(import_picocolors6.default.bold(`Routes (${routes.length})`) + import_picocolors6.default.dim(` \u2014 ${import_node_path11.default.relative(cwd, routesDir)}`));
  console.log();
  const colMethod = 7;
  const colPath = 28;
  console.log(
    import_picocolors6.default.dim("METHOD".padEnd(colMethod)) + import_picocolors6.default.dim("PATH".padEnd(colPath)) + import_picocolors6.default.dim("AUTH") + import_picocolors6.default.dim("  FILE")
  );
  for (const r of routes.sort((a, b) => a.path.localeCompare(b.path))) {
    const meta = readMeta(r.handler);
    const auth = meta?.auth === false ? import_picocolors6.default.green("public") : meta?.auth === true ? import_picocolors6.default.yellow("required") : import_picocolors6.default.dim("jwt*");
    console.log(
      import_picocolors6.default.cyan(r.method.toUpperCase().padEnd(colMethod)) + r.path.padEnd(colPath) + auth.padEnd(12) + import_picocolors6.default.dim(r.relativePath)
    );
  }
  console.log();
  console.log(import_picocolors6.default.dim("* default: JWT when registerAuthBeforeLoadRoutes is used"));
}

// src/commands/gen-client.ts
var import_picocolors7 = __toESM(require("picocolors"));
var import_fs_extra11 = __toESM(require("fs-extra"));
var import_node_path12 = __toESM(require("path"));
async function genClientCommand(opts) {
  const cwd = process.cwd();
  await generateKozoTypes(cwd);
  const buildApp = await resolveBuildApp(cwd);
  if (!buildApp) {
    console.error(import_picocolors7.default.red("Could not find kozo.config.ts or src/app.ts with buildApp()"));
    process.exit(1);
  }
  const app = await buildApp();
  if (typeof app.generateClient !== "function") {
    console.error(import_picocolors7.default.red("App instance has no generateClient() \u2014 did you register routes?"));
    process.exit(1);
  }
  const outPath = import_node_path12.default.resolve(cwd, opts.out ?? "src/generated/client.ts");
  const source = app.generateClient({
    baseUrl: opts.baseUrl ?? "http://localhost:3000",
    includeValidation: true
  });
  await import_fs_extra11.default.ensureDir(import_node_path12.default.dirname(outPath));
  await import_fs_extra11.default.writeFile(outPath, source, "utf8");
  console.log(import_picocolors7.default.green("\u2713 Generated typed client \u2192"), import_node_path12.default.relative(cwd, outPath));
}

// src/commands/types.ts
var import_picocolors8 = __toESM(require("picocolors"));
var import_node_path13 = __toESM(require("path"));
async function typesCommand() {
  const out = await generateKozoTypes();
  if (!out) {
    console.error(import_picocolors8.default.red("No kozo.config.ts found (export default defineKozoApp({ types: ... }))"));
    process.exit(1);
  }
  console.log(import_picocolors8.default.green("\u2713 Generated"), import_node_path13.default.relative(process.cwd(), out));
}

// src/commands/init-template.ts
var import_picocolors9 = __toESM(require("picocolors"));
var import_execa3 = require("execa");
var import_node_path15 = __toESM(require("path"));

// src/utils/copy-template.ts
var import_fs_extra12 = __toESM(require("fs-extra"));
var import_node_path14 = __toESM(require("path"));
var import_node_url2 = require("url");
var import_meta = {};
var TEMPLATE_NAMES = ["minimal", "file-routing", "fullstack-ssr"];
function isTemplateName(value) {
  return TEMPLATE_NAMES.includes(value);
}
function moduleDir() {
  if (typeof __dirname !== "undefined") return __dirname;
  return import_node_path14.default.dirname((0, import_node_url2.fileURLToPath)(import_meta.url));
}
function resolveTemplatesRoot() {
  const here = moduleDir();
  const candidates = [
    import_node_path14.default.resolve(here, "../templates"),
    import_node_path14.default.resolve(here, "../../../../templates"),
    import_node_path14.default.resolve(here, "../../../templates"),
    import_node_path14.default.resolve(here, "../../templates")
  ];
  for (const candidate of candidates) {
    if (import_fs_extra12.default.existsSync(import_node_path14.default.join(candidate, "minimal", "package.json"))) {
      return candidate;
    }
  }
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = import_node_path14.default.join(dir, "templates");
    if (import_fs_extra12.default.existsSync(import_node_path14.default.join(candidate, "minimal", "package.json"))) {
      return candidate;
    }
    const parent = import_node_path14.default.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not find Kozo templates directory.\nRun from the kozo monorepo or install a CLI version that bundles templates/."
  );
}
async function replaceInTree(dir, search, replace) {
  const entries = await import_fs_extra12.default.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = import_node_path14.default.join(dir, entry.name);
    if (entry.isDirectory()) {
      await replaceInTree(full, search, replace);
      continue;
    }
    if (!/\.(ts|tsx|json|md|html|example|env)$/i.test(entry.name) && entry.name !== ".env.example") {
      continue;
    }
    const text3 = await import_fs_extra12.default.readFile(full, "utf8");
    if (text3.includes(search)) {
      await import_fs_extra12.default.writeFile(full, text3.split(search).join(replace), "utf8");
    }
  }
}
async function copyTemplate(template, dest, projectName) {
  if (!isTemplateName(template)) {
    throw new Error(`Unknown template "${template}". Choose: ${TEMPLATE_NAMES.join(", ")}`);
  }
  const src = import_node_path14.default.join(resolveTemplatesRoot(), template);
  if (!import_fs_extra12.default.existsSync(src)) {
    throw new Error(`Template not found: ${src}`);
  }
  if (await import_fs_extra12.default.pathExists(dest)) {
    throw new Error(`Destination already exists: ${dest}`);
  }
  await import_fs_extra12.default.copy(src, dest, {
    filter: (p3) => !import_node_path14.default.relative(src, p3).split(import_node_path14.default.sep).includes("node_modules")
  });
  await replaceInTree(dest, "{{PROJECT_NAME}}", projectName);
}

// src/commands/init-template.ts
async function initFromTemplate(projectName, template, install = true) {
  printLogo();
  console.log(import_picocolors9.default.bold(import_picocolors9.default.red("\u{1F525} Create a new Kozo project")));
  console.log(import_picocolors9.default.dim(`Template: ${template}
`));
  const dest = import_node_path15.default.resolve(process.cwd(), projectName);
  await copyTemplate(template, dest, projectName);
  console.log(import_picocolors9.default.green("\u2713 Project created at"), dest);
  if (install) {
    try {
      await (0, import_execa3.execa)("pnpm", ["install"], { cwd: dest, stdio: "inherit" });
    } catch {
      console.log(import_picocolors9.default.yellow("Run `pnpm install` manually in the project directory."));
    }
  }
  console.log(`
${import_picocolors9.default.bold("Next steps:")}

  ${import_picocolors9.default.cyan(`cd ${projectName}`)}
  ${!install ? import_picocolors9.default.cyan("pnpm install") + "\n  " : ""}${import_picocolors9.default.cyan("pnpm dev")}

${import_picocolors9.default.dim("List routes:")} ${import_picocolors9.default.cyan("kozo routes")}
${import_picocolors9.default.dim("Generate client:")} ${import_picocolors9.default.cyan("kozo gen:client")}
`);
}

// package.json
var package_default = {
  name: "@kozojs/cli",
  version: "0.5.21",
  description: "Scaffold a Kozo backend \u2014 file-system routes, services and auth, structured from day one.",
  type: "commonjs",
  bin: {
    "create-kozo": "./lib/index.js",
    kozo: "./lib/index.js"
  },
  main: "./lib/index.js",
  types: "./lib/index.d.ts",
  files: [
    "lib",
    "templates",
    "README.md"
  ],
  scripts: {
    build: "tsup && node ../../scripts/copy-cli-templates.mjs",
    dev: "tsup --watch",
    test: "vitest run",
    "test:watch": "vitest",
    lint: 'echo "No linting configured" && exit 0'
  },
  keywords: [
    "kozo",
    "framework",
    "backend",
    "typescript",
    "hono",
    "api",
    "rest",
    "cli",
    "scaffold",
    "generator"
  ],
  author: "Kozo Team",
  license: "MIT",
  repository: {
    type: "git",
    url: "https://github.com/zazzo9039/kozo.git"
  },
  homepage: "https://github.com/zazzo9039/kozo#readme",
  bugs: "https://github.com/zazzo9039/kozo/issues",
  engines: {
    node: ">=20.19.0"
  },
  dependencies: {
    "@clack/prompts": "^0.8.0",
    "@kozojs/core": "workspace:^",
    commander: "^12.0.0",
    picocolors: "^1.1.0",
    execa: "^9.5.0",
    "fs-extra": "^11.2.0",
    glob: "^11.0.0",
    chokidar: "^3.6.0"
  },
  devDependencies: {
    "@types/fs-extra": "^11.0.4",
    "@types/node": "^22.0.0",
    tsup: "^8.3.0",
    typescript: "^5.6.0",
    vitest: "^2.1.0"
  }
};

// src/index.ts
var program = new import_commander.Command();
program.name("kozo").description("CLI to scaffold new Kozo Framework projects").version(package_default.version);
program.argument("[project-name]", "Name of the project").option("-t, --template <name>", `Starter template: ${["minimal", "file-routing", "fullstack-ssr"].join(", ")}`).option("--no-install", "Skip pnpm install after scaffolding").action(async (projectName, opts) => {
  if (opts?.template) {
    if (!projectName) {
      console.error("Project name is required with --template");
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
program.command("build").description("Build the project (generates routes manifest then compiles with tsup)").option("--no-manifest", "Skip routes-manifest.json generation").option("--force-manifest", "Force manifest regeneration even if routes are unchanged").option("--routes-dir <dir>", "Routes directory relative to project root", "src/routes").option("--manifest-out <path>", "Output path for routes-manifest.json relative to project root").allowUnknownOption().action(async (opts, cmd) => {
  const tsupArgs = cmd.args.length > 0 ? cmd.args : void 0;
  await buildCommand({
    noManifest: opts.noManifest === false || opts.manifest === false,
    forceManifest: opts.forceManifest ?? false,
    routesDir: opts.routesDir,
    manifestOut: opts.manifestOut,
    tsupArgs
  });
});
program.command("dev").description("Start development server with hot reload and route watcher").action(async () => {
  await devCommand();
});
program.command("generate [type] [name]").alias("g").description("Generate scaffolding: route, middleware").action(async (type, name) => {
  await generateCommand(type ?? "", name);
});
program.command("routes").description("List routes from the file-system routes directory").option("--routes-dir <dir>", "Routes directory relative to project root").action(async (opts) => {
  await routesCommand(opts);
});
program.command("types").description("Generate .kozo/types.d.ts from kozo.config.ts (typed route handlers)").action(async () => {
  await typesCommand();
});
program.command("gen:client").description("Generate a typed API client (kozo.config.ts or src/app.ts with buildApp)").option("-o, --out <path>", "Output file path", "src/generated/client.ts").option("--base-url <url>", "Base URL for the client", "http://localhost:3000").action(async (opts) => {
  await genClientCommand(opts);
});
program.parse();
