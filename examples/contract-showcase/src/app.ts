import { createKozo } from '@kozojs/core';
import { problem } from './contracts/problem.js';
import { adminRoutes, projectsRoutes, usersRoutes } from './modules/index.js';
import { createMemoryServices, type AppServices } from './services.js';

export function createContractShowcaseApp() {
  const app = createKozo<AppServices>({ logger: false, services: createMemoryServices() });

  app.guard('/admin/*', (request) => {
    if (request.header('authorization') === 'Bearer demo-token') return;
    return {
      deny: {
        status: 401,
        body: problem(401, 'Unauthorized', 'Missing or invalid bearer token'),
      },
    };
  });

  const contractedApp = app
    .mount('/users', usersRoutes)
    .mount('/projects', projectsRoutes)
    .mount('/admin', adminRoutes);

  contractedApp.mountDocs({
    title: 'Kozo Contract Showcase',
    version: '0.7.1',
    description: 'One route contract shared by runtime, OpenAPI, SDKs and tests.',
    enabled: true,
  });

  return contractedApp;
}
