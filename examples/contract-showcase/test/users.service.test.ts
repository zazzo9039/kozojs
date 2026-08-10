import { describe, expect, it } from 'vitest';
import { createMemoryUserService } from '../src/modules/users/index.js';

describe('user service', () => {
  it('applies filters without starting HTTP', () => {
    const users = createMemoryUserService();
    users.create({ name: 'Ada', email: 'ada@example.com', password: 'correct-horse', active: true, tags: ['ts'] });
    users.create({ name: 'Grace', email: 'grace@example.com', password: 'compiler-123', active: false, tags: [] });

    expect(users.list({ page: 1, active: 'true', tag: 'ts' }).total).toBe(1);
    expect(users.list({ page: 1, active: 'false' }).items[0]?.name).toBe('Grace');
  });
});
