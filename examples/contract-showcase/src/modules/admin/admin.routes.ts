import { createRouter } from '@kozojs/core';
import type { AppServices } from '../../services.js';
import { AdminResponses, AuthorizationHeadersSchema } from './admin.contract.js';

export const adminRoutes = createRouter<AppServices>().get(
  '/stats',
  { headers: AuthorizationHeadersSchema, response: AdminResponses.stats },
  ({ services, json }) => json({ users: services.users.count(), projects: services.projects.count() }, 200),
  { summary: 'Get service statistics', tags: ['Admin'] },
);
