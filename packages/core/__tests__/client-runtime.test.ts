// ============================================================================
// Functional tests for the GENERATED client runtime (KozoClient v2):
// the generated TS is transpiled and executed against a stubbed fetch.
// ============================================================================

import { describe, it, expect, vi, beforeAll } from 'vitest';
import ts from 'typescript';
import { z } from 'zod';
import { generateTypedClient, type RouteInfo } from '../src/client-generator.js';

const routes: RouteInfo[] = [
  {
    method: 'get',
    path: '/users/:id',
    schema: {
      response: {
        200: z.object({ id: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  },
  { method: 'post', path: '/login', schema: {} },
  { method: 'get', path: '/items', schema: {} },
];

// includeValidation: false → no zod import → the module is self-contained
// and importable from a data: URL.
async function loadGeneratedClient() {
  const code = generateTypedClient(routes, { includeValidation: false });
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

let mod: any;
beforeAll(async () => {
  mod = await loadGeneratedClient();
});

function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? {} : { 'content-type': contentType },
  });
}

describe('generated KozoClient runtime', () => {
  it('returns declared statuses from the preferred route-tree client', async () => {
    const responses = [
      jsonResponse({ id: 'team/user 1' }, 200),
      jsonResponse({ message: 'missing' }, 404),
    ];
    const calls: string[] = [];
    const api = mod.createKozoClient({
      baseUrl: 'http://api.test/',
      fetch: async (url: string) => {
        calls.push(url);
        return responses.shift()!;
      },
    });

    const found = await api.users.$id.get({
      params: { id: 'team/user 1' },
    });
    expect(found).toMatchObject({
      status: 200,
      ok: true,
      body: { id: 'team/user 1' },
    });

    const missing = await api.users.$id.get({
      params: { id: 'missing' },
    });
    expect(missing).toMatchObject({
      status: 404,
      ok: false,
      body: { message: 'missing' },
    });
    expect(calls).toEqual([
      'http://api.test/users/team%2Fuser%201',
      'http://api.test/users/missing',
    ]);
  });

  it('throws when the server returns a status outside the generated contract', async () => {
    const onError = vi.fn();
    const api = mod.createKozoClient({
      onError,
      fetch: async () => jsonResponse({ message: 'unexpected' }, 500),
    });

    const error = await api.users.$id.get({
      params: { id: '7' },
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(mod.KozoUnexpectedResponseError);
    expect(error).toMatchObject({
      status: 500,
      declaredStatuses: [200, 404],
    });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('attaches the bearer token from getToken (async supported)', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new mod.KozoClient({
      baseUrl: 'http://api.test',
      getToken: async () => 'tok-123',
      fetch: async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonResponse({ id: '7' });
      },
    });

    const result = await client.usersById({ id: '7' });
    expect(result).toEqual({ id: '7' });
    expect(calls[0].url).toBe('http://api.test/users/7');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('skips Authorization when getToken returns null', async () => {
    const calls: Array<{ init: RequestInit }> = [];
    const client = new mod.KozoClient({
      getToken: () => null,
      fetch: async (_url: string, init: RequestInit) => {
        calls.push({ init });
        return jsonResponse({});
      },
    });
    await client.items();
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('throws KozoApiError with RFC 7807 fields on non-2xx', async () => {
    const client = new mod.KozoClient({
      fetch: async () =>
        jsonResponse(
          { type: 'https://docs.test/errors/auth', title: 'Invalid credentials', status: 401, detail: 'Wrong password' },
          401,
          'application/problem+json',
        ),
    });

    const err = await client.postLogin().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(mod.KozoApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('Invalid credentials');
    expect(err.problem).toMatchObject({ detail: 'Wrong password', type: 'https://docs.test/errors/auth' });
  });

  it('fires onUnauthorized and onError on 401, only onError on other failures', async () => {
    const onUnauthorized = vi.fn();
    const onError = vi.fn();
    const make = (status: number) =>
      new mod.KozoClient({
        onUnauthorized,
        onError,
        fetch: async () => jsonResponse({ title: 'nope' }, status),
      });

    await expect(make(401).postLogin()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    await expect(make(500).postLogin()).rejects.toMatchObject({ status: 500 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1); // unchanged
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('returns null on 204 No Content instead of crashing on .json()', async () => {
    const client = new mod.KozoClient({ fetch: async () => jsonResponse(null, 204) });
    await expect(client.items()).resolves.toBeNull();
  });

  it('onRequest can mutate url and headers before sending', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new mod.KozoClient({
      onRequest: (req: { url: string; headers: Record<string, string> }) => {
        req.headers['X-Trace'] = 'abc';
      },
      fetch: async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonResponse({});
      },
    });
    await client.items({ headers: { 'X-Extra': '1' } });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['X-Trace']).toBe('abc');
    expect(headers['X-Extra']).toBe('1');
  });

  it('exposes signal pass-through for AbortController', async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const client = new mod.KozoClient({
      fetch: async (_url: string, init: RequestInit) => {
        seenSignal = init.signal ?? undefined;
        return jsonResponse({});
      },
    });
    await client.items({ signal: controller.signal });
    expect(seenSignal).toBe(controller.signal);
  });
});
