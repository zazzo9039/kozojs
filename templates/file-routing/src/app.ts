/**
 * File-routing example — health, auth, API users, admin stats.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKozo } from '@kozojs/core';
import { logger } from '@kozojs/core';
import { registerAuthBeforeLoadRoutes } from '@kozojs/auth';
import { userStore, type AppServices } from './services.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const routesDir = path.join(__dirname, 'routes');

export async function buildApp() {
  const app = createKozo<AppServices>({
    routesDir,
    services: { users: userStore },
  });

  app.middleware(logger());

  const secret = process.env.JWT_SECRET ?? 'dev-secret-must-be-at-least-32-characters-long';
  await registerAuthBeforeLoadRoutes(app, secret, { routesDir, prefix: '' });
  await app.loadRoutes();

  return app;
}
