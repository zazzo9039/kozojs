/**
 * Production-ready API example with Drizzle ORM, JWT auth, and per-directory middleware.
 *
 * Project structure:
 *
 *   src/
 *   ├── index.ts                          ← this file
 *   ├── db.ts                             ← Drizzle setup
 *   ├── routes/
 *   │   ├── _middleware.ts                ← global logger/cors
 *   │   ├── health/get.ts
 *   │   ├── auth/
 *   │   │   ├── login/post.ts
 *   │   │   └── register/post.ts
 *   │   ├── api/
 *   │   │   ├── _middleware.ts            ← JWT auth for /api/*
 *   │   │   ├── users/get.ts
 *   │   │   ├── users/[id]/get.ts
 *   │   │   └── users/[id]/patch.ts
 *   │   └── admin/
 *   │       ├── _middleware.ts            ← role check for /admin/*
 *   │       └── stats/get.ts
 *
 * Install:
 *   pnpm add @kozojs/core @kozojs/auth @kozojs/db hono zod jose drizzle-orm better-sqlite3
 *   pnpm add -D @types/better-sqlite3 drizzle-kit typescript tsx
 */

import { createKozo } from '@kozojs/core';
import { cors, logger, rateLimit } from '@kozojs/core';
import path from 'node:path';

// ── Services ────────────────────────────────────────────────────────

// In production, these would be separate modules imported from src/services/
const mockDb = {
  users: {
    findAll: async () => [
      { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin' },
      { id: '2', name: 'Bob', email: 'bob@example.com', role: 'user' },
    ],
    findById: async (id: string) => ({
      id, name: 'Alice', email: 'alice@example.com', role: 'admin',
    }),
    create: async (data: any) => ({ id: crypto.randomUUID(), ...data }),
    update: async (id: string, data: any) => ({ id, ...data }),
    count: async () => 42,
  },
  close: async () => console.log('Database connection closed'),
  migrate: async () => console.log('Database migrations applied'),
};

const mockMailer = {
  sendWelcome: async (email: string) => console.log(`Welcome email sent to ${email}`),
};

// ── App ─────────────────────────────────────────────────────────────

const app = createKozo({
  routesDir: path.join(import.meta.dirname ?? '.', 'routes'),
  services: {
    db: mockDb,
    mailer: mockMailer,
  },

  // Lifecycle hooks
  onStart: async ({ services }) => {
    await services.db.migrate();
    console.log('✅ Services initialized');
  },
  onStop: async ({ services }) => {
    await services.db.close();
    console.log('🛑 Services cleaned up');
  },
});

// ── Global Middleware ────────────────────────────────────────────────

app.middleware(logger());
app.middleware(cors({ origin: '*' }));
app.middleware('/api/*', rateLimit({ max: 100, window: 60_000 }));

// ── Routes ──────────────────────────────────────────────────────────

// Manual route for health check (alternative to file-system routing)
app.get('/health', (ctx) => ctx.json({
  status: 'ok',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}));

// Load file-system routes + per-directory middleware
await app.loadRoutes();

// ── Start ───────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;
await app.listen(PORT);
