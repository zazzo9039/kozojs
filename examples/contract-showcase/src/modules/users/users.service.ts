import type { Infer } from '@kozojs/core';
import type { CreateUserSchema, UserSchema } from './users.contract.js';

type CreateUser = Infer<typeof CreateUserSchema>;
type PublicUser = Infer<typeof UserSchema>;
type StoredUser = PublicUser & { passwordHash: string };

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

export function createMemoryUserService(): UserService {
  const users = new Map<string, StoredUser>();
  let nextId = 1;
  return {
    create(input) {
      const user = { id: `user-${nextId++}`, name: input.name, email: input.email,
        active: input.active, tags: input.tags, passwordHash: `demo:${input.password}` };
      users.set(user.id, user);
      return user;
    },
    find: (id) => users.get(id),
    list({ page, active, tag }) {
      const requiredTags = tag === undefined ? [] : Array.isArray(tag) ? tag : [tag];
      const items = [...users.values()].filter((user) => {
        if (active !== undefined && user.active !== (active === 'true')) return false;
        return requiredTags.every((value) => user.tags.includes(value));
      });
      return { items, page, total: items.length };
    },
    count: () => users.size,
  };
}
