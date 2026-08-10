import type { Services } from '@kozojs/core';
import { createUserService, type UserService } from './modules/users/index.js';

export interface AppServices extends Services { users: UserService }
export const createServices = (): AppServices => ({ users: createUserService() });
