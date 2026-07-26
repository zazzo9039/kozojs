import { describe, expect, it } from 'vitest';
import { createContractTestClient } from '@kozojs/testing';
import { createContractShowcaseApp } from '../src/app.js';

describe('contract-aware client', () => {
  it('uses route schemas for inputs, statuses and response stripping', async () => {
    const client = createContractTestClient(createContractShowcaseApp());

    const created = await client.users.post({
      body: {
        name: 'Ada',
        email: 'ada@example.com',
        password: 'correct-horse',
        tags: ['typescript', 'backend'],
      },
    });

    expect(created.status).toBe(201);
    expect(created.json()).toEqual({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      active: true,
      tags: ['typescript', 'backend'],
    });
    expect(created.body).not.toContain('passwordHash');

    const detail = await client.users.$id.get({
      params: { id: 'user-1' },
    });
    expect(detail.status).toBe(200);

    const list = await client.users.get({
      query: {
        page: 1,
        active: 'true',
        tag: ['typescript', 'backend'],
      },
    });
    expect(list.json()).toMatchObject({ total: 1, page: 1 });
  });

  it('types bodies, parameters, headers and status-specific responses', async () => {
    const client = createContractTestClient(createContractShowcaseApp());

    const user = await client.users.post({
      body: {
        name: 'Grace',
        email: 'grace@example.com',
        password: 'compiler-123',
      },
    });
    const project = await client.projects.post({
      body: { name: 'Typed API', ownerId: user.json().id },
    });

    expect(project.status).toBe(201);
    expect(project.json().ownerId).toBe('user-1');

    const stats = await client.admin.stats.get({
      headers: { authorization: 'Bearer demo-token' },
    });
    expect(stats.status).toBe(200);
    if (stats.status !== 200) throw new Error('Expected an authorized response');
    expect(stats.json()).toEqual({ users: 1, projects: 1 });
  });
});
