import type { Services } from '@kozojs/core';
import { createMemoryProjectService, type ProjectService } from './modules/projects/index.js';
import { createMemoryUserService, type UserService } from './modules/users/index.js';

export interface AppServices extends Services {
  users: UserService;
  projects: ProjectService;
}

export function createMemoryServices(): AppServices {
  return {
    users: createMemoryUserService(),
    projects: createMemoryProjectService(),
  };
}
