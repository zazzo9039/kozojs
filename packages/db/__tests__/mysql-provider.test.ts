import { describe, it, expect, vi, beforeEach } from 'vitest';

const createPool = vi.fn(() => ({ mockPool: true }));
const drizzle = vi.fn((pool: unknown, opts: unknown) => ({ pool, opts, isDrizzle: true }));

vi.mock('mysql2/promise', () => ({
  default: { createPool },
  createPool,
}));

vi.mock('drizzle-orm/mysql2', () => ({
  drizzle,
}));

import { createDatabase } from '../src/index.js';

describe('@kozojs/db — createDatabase (mysql smoke)', () => {
  beforeEach(() => {
    createPool.mockClear();
    drizzle.mockClear();
  });

  it('loads mysql2 + drizzle mysql driver and returns a pool-backed client', async () => {
    const url = 'mysql://user:pass@localhost:3306/test';
    const db = await createDatabase({ provider: 'mysql', url });

    expect(createPool).toHaveBeenCalledWith(url);
    expect(drizzle).toHaveBeenCalledWith(
      expect.objectContaining({ mockPool: true }),
      expect.objectContaining({ mode: 'default' }),
    );
    expect(db).toMatchObject({ isDrizzle: true });
  });
});
