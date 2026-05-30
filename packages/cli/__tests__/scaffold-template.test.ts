import { describe, it, expect } from 'vitest';

import { getDatabaseSchema } from '../src/utils/scaffold/template-complete.js';

describe('scaffold templates', () => {
  it('generates sqlite schema by default', () => {
    const schema = getDatabaseSchema('sqlite');
    expect(schema).toContain('sqliteTable');
    expect(schema).toContain("export const users");
  });

  it('generates postgresql schema', () => {
    const schema = getDatabaseSchema('postgresql');
    expect(schema).toContain('pgTable');
  });

  it('generates mysql schema', () => {
    const schema = getDatabaseSchema('mysql');
    expect(schema).toContain('mysqlTable');
  });
});
