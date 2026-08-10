import { createKozo, createRouter, z } from '@kozojs/core';
import { problem, ProblemSchema } from './contracts/problem.js';
import { usersRoutes } from './modules/index.js';
import { createServices, type AppServices } from './services.js';

const adminRoutes = createRouter<AppServices>()
  .get('/health', { response: { 200: z.object({ ok: z.literal(true) }), 401: ProblemSchema } },
    ({ json }) => json({ ok: true as const }, 200));

export function createApp() {
  const app = createKozo<AppServices>({ logger: false, services: createServices() });
  app.guard('/admin/*', (request) => request.header('authorization') === 'Bearer demo-token'
    ? undefined
    : { deny: { status: 401, body: problem(401, 'Unauthorized', 'Invalid bearer token') } });
  const contractedApp = app.mount('/users', usersRoutes).mount('/admin', adminRoutes);
  contractedApp.mountDocs({ title: '{{PROJECT_NAME}}', version: '0.1.0', enabled: true });
  return contractedApp;
}
