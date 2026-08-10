import { describe, expect, it } from 'vitest';
import { createUserService } from './users.service.js';

describe('user service', () => {
  it('creates and retrieves a user without HTTP', () => {
    const users = createUserService();
    const user = users.create({ name: 'Ada', email: 'ada@example.com' });
    expect(users.find(user.id)).toEqual(user);
  });
});
