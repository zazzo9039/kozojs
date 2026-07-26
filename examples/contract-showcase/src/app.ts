import { createKozo, createRouter } from '@kozojs/core';
import {
  AdminStatsSchema,
  AuthorizationHeadersSchema,
  CreateProjectSchema,
  CreateUserSchema,
  ErrorSchema,
  ProjectIdParamsSchema,
  ProjectSchema,
  UserIdParamsSchema,
  UserListSchema,
  UserQuerySchema,
  UserSchema,
} from './schemas.js';
import { createMemoryServices, type AppServices } from './services.js';

const userRoutes = createRouter<AppServices>()
  .post(
    '/',
    {
      body: CreateUserSchema,
      response: { 201: UserSchema },
    },
    ({ body, services, json }) => json(services.users.create(body), 201),
    { summary: 'Create a user', tags: ['Users'] },
  )
  .get(
    '/:id',
    {
      params: UserIdParamsSchema,
      response: { 200: UserSchema, 404: ErrorSchema },
    },
    ({ params, services, json }) => {
      const user = services.users.find(params.id);
      return user
        ? json(user, 200)
        : json({ message: 'User not found' }, 404);
    },
    { summary: 'Get a user', tags: ['Users'] },
  )
  .get(
    '/',
    {
      query: UserQuerySchema,
      response: { 200: UserListSchema },
    },
    ({ query, services, json }) => json(services.users.list(query), 200),
    { summary: 'List users', tags: ['Users'] },
  );

const projectRoutes = createRouter<AppServices>()
  .post(
    '/',
    {
      body: CreateProjectSchema,
      response: { 201: ProjectSchema },
    },
    ({ body, services, json }) => json(services.projects.create(body), 201),
    { summary: 'Create a project', tags: ['Projects'] },
  )
  .get(
    '/:id',
    {
      params: ProjectIdParamsSchema,
      response: { 200: ProjectSchema, 404: ErrorSchema },
    },
    ({ params, services, json }) => {
      const project = services.projects.find(params.id);
      return project
        ? json(project, 200)
        : json({ message: 'Project not found' }, 404);
    },
    { summary: 'Get a project', tags: ['Projects'] },
  );

const adminRoutes = createRouter<AppServices>()
  .get(
    '/stats',
    {
      headers: AuthorizationHeadersSchema,
      response: { 200: AdminStatsSchema, 401: ErrorSchema },
    },
    ({ services, json }) => json({
      users: services.users.count(),
      projects: services.projects.count(),
    }, 200),
    { summary: 'Get service statistics', tags: ['Admin'] },
  );

export function createContractShowcaseApp() {
  const app = createKozo<AppServices>({
    logger: false,
    services: createMemoryServices(),
  });

  app.guard('/admin/*', (request) => {
    if (request.header('authorization') === 'Bearer demo-token') return;
    return {
      deny: {
        status: 401,
        body: { message: 'Missing or invalid bearer token' },
      },
    };
  });

  const contractedApp = app
    .mount('/users', userRoutes)
    .mount('/projects', projectRoutes)
    .mount('/admin', adminRoutes);

  contractedApp.mountDocs({
    title: 'Kozo Contract Showcase',
    version: '0.7.0',
    description: 'One route contract shared by runtime, OpenAPI, SDKs and tests.',
    enabled: true,
  });

  return contractedApp;
}
