import { createRouter } from '@kozojs/core';
import { problem } from '../../contracts/problem.js';
import type { AppServices } from '../../services.js';
import { CreateProjectSchema, ProjectIdParamsSchema, ProjectResponses } from './projects.contract.js';

export const projectsRoutes = createRouter<AppServices>()
  .post('/', { body: CreateProjectSchema, response: ProjectResponses.created },
    ({ body, services, json }) => json(services.projects.create(body), 201),
    { summary: 'Create a project', tags: ['Projects'] })
  .get('/:id', { params: ProjectIdParamsSchema, response: ProjectResponses.detail },
    ({ params, services, json }) => {
      const project = services.projects.find(params.id);
      return project ? json(project, 200) : json(problem(404, 'Not Found', 'Project not found'), 404);
    },
    { summary: 'Get a project', tags: ['Projects'] });
