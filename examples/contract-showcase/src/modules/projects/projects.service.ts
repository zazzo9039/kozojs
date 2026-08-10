import type { Infer } from '@kozojs/core';
import type { CreateProjectSchema, ProjectSchema } from './projects.contract.js';

type CreateProject = Infer<typeof CreateProjectSchema>;
type PublicProject = Infer<typeof ProjectSchema>;

export interface ProjectService {
  create(input: CreateProject): PublicProject;
  find(id: string): PublicProject | undefined;
  count(): number;
}

export function createMemoryProjectService(): ProjectService {
  const projects = new Map<string, PublicProject>();
  let nextId = 1;
  return {
    create(input) {
      const project = { id: `project-${nextId++}`, ...input };
      projects.set(project.id, project);
      return project;
    },
    find: (id) => projects.get(id),
    count: () => projects.size,
  };
}
