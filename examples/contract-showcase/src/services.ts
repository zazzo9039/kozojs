import type { Infer, Services } from '@kozojs/core';
import type {
  CreateProjectSchema,
  CreateUserSchema,
  ProjectSchema,
  UserSchema,
} from './schemas.js';

type CreateUser = Infer<typeof CreateUserSchema>;
type PublicUser = Infer<typeof UserSchema>;
type CreateProject = Infer<typeof CreateProjectSchema>;
type PublicProject = Infer<typeof ProjectSchema>;

type StoredUser = PublicUser & {
  passwordHash: string;
};

export interface UserFilters {
  page: number;
  active?: 'true' | 'false';
  tag?: string | string[];
}

export interface UserService {
  create(input: CreateUser): StoredUser;
  find(id: string): StoredUser | undefined;
  list(filters: UserFilters): { items: StoredUser[]; page: number; total: number };
  count(): number;
}

export interface ProjectService {
  create(input: CreateProject): PublicProject;
  find(id: string): PublicProject | undefined;
  count(): number;
}

export interface AppServices extends Services {
  users: UserService;
  projects: ProjectService;
}

export function createMemoryServices(): AppServices {
  const users = new Map<string, StoredUser>();
  const projects = new Map<string, PublicProject>();
  let nextUserId = 1;
  let nextProjectId = 1;

  return {
    users: {
      create(input) {
        const user: StoredUser = {
          id: `user-${nextUserId++}`,
          name: input.name,
          email: input.email,
          active: input.active,
          tags: input.tags,
          passwordHash: `demo:${input.password}`,
        };
        users.set(user.id, user);
        return user;
      },
      find(id) {
        return users.get(id);
      },
      list({ page, active, tag }) {
        const requiredTags = tag === undefined ? [] : Array.isArray(tag) ? tag : [tag];
        const items = [...users.values()].filter((user) => {
          if (active !== undefined && user.active !== (active === 'true')) return false;
          return requiredTags.every((value) => user.tags.includes(value));
        });
        return { items, page, total: items.length };
      },
      count() {
        return users.size;
      },
    },
    projects: {
      create(input) {
        const project: PublicProject = {
          id: `project-${nextProjectId++}`,
          ...input,
        };
        projects.set(project.id, project);
        return project;
      },
      find(id) {
        return projects.get(id);
      },
      count() {
        return projects.size;
      },
    },
  };
}
