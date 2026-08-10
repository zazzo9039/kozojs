import { createRouter } from '@kozojs/core';
import { problem } from '../../contracts/problem.js';
import type { AppServices } from '../../services.js';
import { CreateUserSchema, UserIdParamsSchema, UserResponses } from './users.contract.js';

export const usersRoutes = createRouter<AppServices>()
  .get('/', { response: UserResponses.list },
    ({ services, json }) => json({ items: services.users.list() }, 200))
  .post('/', { body: CreateUserSchema, response: UserResponses.created },
    ({ body, services, json }) => json(services.users.create(body), 201))
  .get('/:id', { params: UserIdParamsSchema, response: UserResponses.detail },
    ({ params, services, json }) => {
      const user = services.users.find(params.id);
      return user ? json(user, 200) : json(problem(404, 'Not Found', 'User not found'), 404);
    });
