import type { Infer } from '@kozojs/core';
import type { CreateUserSchema, UserSchema } from './users.contract.js';

type User = Infer<typeof UserSchema>;
type CreateUser = Infer<typeof CreateUserSchema>;

export interface UserService {
  list(): User[];
  find(id: string): User | undefined;
  create(input: CreateUser): User;
}

export function createUserService(): UserService {
  const users = new Map<string, User>();
  let nextId = 1;
  return {
    list: () => [...users.values()],
    find: (id) => users.get(id),
    create(input) {
      const user = { id: `user-${nextId++}`, ...input };
      users.set(user.id, user);
      return user;
    },
  };
}
