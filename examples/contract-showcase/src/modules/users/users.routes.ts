import { createRouter } from '@kozojs/core';
import { problem } from '../../contracts/problem.js';
import type { AppServices } from '../../services.js';
import { CreateUserSchema, UserIdParamsSchema, UserQuerySchema, UserResponses } from './users.contract.js';

export const usersRoutes = createRouter<AppServices>()
  .post('/', { body: CreateUserSchema, response: UserResponses.created },
    ({ body, services, json }) => json(services.users.create(body), 201),
    { summary: 'Create a user', tags: ['Users'] })
  .get('/:id', { params: UserIdParamsSchema, response: UserResponses.detail },
    ({ params, services, json }) => {
      const user = services.users.find(params.id);
      return user ? json(user, 200) : json(problem(404, 'Not Found', 'User not found'), 404);
    },
    { summary: 'Get a user', tags: ['Users'] })
  .get('/', { query: UserQuerySchema, response: UserResponses.list },
    ({ query, services, json }) => json(services.users.list(query), 200),
    { summary: 'List users', tags: ['Users'] });
