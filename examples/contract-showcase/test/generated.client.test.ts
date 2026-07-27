import { describe, expect, it } from 'vitest';
import {
  createKozoClient,
  KozoClient,
} from '../generated/api.js';

describe('generated SDK transport', () => {
  it('uses the route tree, encodes path parameters and repeats array query keys', async () => {
    const requestedUrls: string[] = [];
    const api = createKozoClient({
      baseUrl: 'https://api.example.test',
      fetch: async (input) => {
        requestedUrls.push(String(input));
        return new Response(JSON.stringify({
          items: [],
          page: 1,
          total: 0,
          id: 'user-1',
          name: 'Ada',
          email: 'ada@example.com',
          active: true,
          tags: [],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const list = await api.users.get({
      query: {
        page: 1,
        active: 'false',
        tag: ['typescript', 'backend'],
      },
    });
    const detail = await api.users.$id.get({
      params: { id: 'team/user 1' },
    });

    const listUrl = new URL(requestedUrls[0]);
    expect(listUrl.searchParams.getAll('tag')).toEqual(['typescript', 'backend']);
    expect(listUrl.searchParams.get('active')).toBe('false');
    expect(requestedUrls[1]).toBe(
      'https://api.example.test/users/team%2Fuser%201',
    );
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
  });

  it('returns declared error statuses and keeps legacy aliases working', async () => {
    const response = () => new Response(JSON.stringify({
      message: 'User not found',
    }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });

    const api = createKozoClient({ fetch: async () => response() });
    const result = await api.users.$id.get({ params: { id: 'missing' } });

    expect(result.status).toBe(404);
    if (result.status === 404) {
      expect(result.body.message).toBe('User not found');
    }

    const legacy = new KozoClient({ fetch: async () => response() });
    await expect(legacy.usersById({ id: 'missing' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
