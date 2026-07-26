import { describe, expect, it } from 'vitest';
import { KozoClient } from '../generated/api.js';

describe('generated SDK transport', () => {
  it('encodes path parameters and repeats array query keys', async () => {
    const requestedUrls: string[] = [];
    const api = new KozoClient({
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

    await api.users({
      page: 1,
      active: 'false',
      tag: ['typescript', 'backend'],
    });
    await api.usersById({ id: 'team/user 1' });

    const listUrl = new URL(requestedUrls[0]);
    expect(listUrl.searchParams.getAll('tag')).toEqual(['typescript', 'backend']);
    expect(listUrl.searchParams.get('active')).toBe('false');
    expect(requestedUrls[1]).toBe(
      'https://api.example.test/users/team%2Fuser%201',
    );
  });
});
