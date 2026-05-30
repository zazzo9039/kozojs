import { describe, it, expect } from 'vitest';
import { fileToPath, isRouteFile } from '../src/utils/file-to-path';

describe('fileToPath', () => {
  // ── Static routes ──────────────────────────────────────────────────────────
  describe('static routes', () => {
    it('index.ts → GET /', () => {
      expect(fileToPath('index.ts')).toEqual({ path: '/', method: 'get' });
    });

    it('health.ts → GET /health', () => {
      expect(fileToPath('health.ts')).toEqual({ path: '/health', method: 'get' });
    });

    it('users/index.ts → GET /users', () => {
      expect(fileToPath('users/index.ts')).toEqual({ path: '/users', method: 'get' });
    });

    it('users/get.ts → GET /users', () => {
      expect(fileToPath('users/get.ts')).toEqual({ path: '/users', method: 'get' });
    });

    it('users/post.ts → POST /users', () => {
      expect(fileToPath('users/post.ts')).toEqual({ path: '/users', method: 'post' });
    });

    it('users/put.ts → PUT /users', () => {
      expect(fileToPath('users/put.ts')).toEqual({ path: '/users', method: 'put' });
    });

    it('users/patch.ts → PATCH /users', () => {
      expect(fileToPath('users/patch.ts')).toEqual({ path: '/users', method: 'patch' });
    });

    it('users/delete.ts → DELETE /users', () => {
      expect(fileToPath('users/delete.ts')).toEqual({ path: '/users', method: 'delete' });
    });
  });

  // ── Dynamic params [id] ────────────────────────────────────────────────────
  describe('dynamic params [id]', () => {
    it('users/[id].ts → GET /users/:id', () => {
      expect(fileToPath('users/[id].ts')).toEqual({ path: '/users/:id', method: 'get' });
    });

    it('users/[id]/get.ts → GET /users/:id', () => {
      expect(fileToPath('users/[id]/get.ts')).toEqual({ path: '/users/:id', method: 'get' });
    });

    it('users/[id]/patch.ts → PATCH /users/:id', () => {
      expect(fileToPath('users/[id]/patch.ts')).toEqual({ path: '/users/:id', method: 'patch' });
    });

    it('users/[id]/posts/[postId].ts → GET /users/:id/posts/:postId', () => {
      expect(fileToPath('users/[id]/posts/[postId].ts')).toEqual({
        path: '/users/:id/posts/:postId',
        method: 'get',
      });
    });
  });

  // ── Optional params [id?] ──────────────────────────────────────────────────
  describe('optional params [id?]', () => {
    it('[id?].ts → GET /:id?', () => {
      expect(fileToPath('[id?].ts')).toEqual({ path: '/:id?', method: 'get' });
    });

    it('users/[id?].ts → GET /users/:id?', () => {
      expect(fileToPath('users/[id?].ts')).toEqual({ path: '/users/:id?', method: 'get' });
    });

    it('[org?].ts → GET /:org?', () => {
      expect(fileToPath('[org?].ts')).toEqual({ path: '/:org?', method: 'get' });
    });

    it('orgs/[org?].ts → GET /orgs/:org?', () => {
      expect(fileToPath('orgs/[org?].ts')).toEqual({ path: '/orgs/:org?', method: 'get' });
    });

    it('[id?]/posts/[postId?].ts → GET /:id?/posts/:postId?', () => {
      expect(fileToPath('[id?]/posts/[postId?].ts')).toEqual({
        path: '/:id?/posts/:postId?',
        method: 'get',
      });
    });

    it('users/[id?]/comments/[commentId?].ts → GET /users/:id?/comments/:commentId?', () => {
      expect(fileToPath('users/[id?]/comments/[commentId?].ts')).toEqual({
        path: '/users/:id?/comments/:commentId?',
        method: 'get',
      });
    });

    it('optional param with explicit method: users/[id?]/post.ts → POST /users/:id?', () => {
      expect(fileToPath('users/[id?]/post.ts')).toEqual({ path: '/users/:id?', method: 'post' });
    });
  });

  // ── Catch-all [...slug] ────────────────────────────────────────────────────
  describe('catch-all [...slug]', () => {
    it('posts/[...slug].ts → GET /posts/*', () => {
      expect(fileToPath('posts/[...slug].ts')).toEqual({ path: '/posts/*', method: 'get' });
    });

    it('[...slug].ts → GET /*', () => {
      expect(fileToPath('[...slug].ts')).toEqual({ path: '/*', method: 'get' });
    });

    it('[...path].ts → GET /*', () => {
      expect(fileToPath('[...path].ts')).toEqual({ path: '/*', method: 'get' });
    });
  });

  // ── Mixed static + dynamic ─────────────────────────────────────────────────
  describe('mixed static and dynamic segments', () => {
    it('api/v1/users/[id].ts → GET /api/v1/users/:id', () => {
      expect(fileToPath('api/v1/users/[id].ts')).toEqual({
        path: '/api/v1/users/:id',
        method: 'get',
      });
    });

    it('api/v1/users/[id?].ts → GET /api/v1/users/:id?', () => {
      expect(fileToPath('api/v1/users/[id?].ts')).toEqual({
        path: '/api/v1/users/:id?',
        method: 'get',
      });
    });

    it('[id]/posts/[postId?].ts → GET /:id/posts/:postId?', () => {
      expect(fileToPath('[id]/posts/[postId?].ts')).toEqual({
        path: '/:id/posts/:postId?',
        method: 'get',
      });
    });
  });
});

describe('isRouteFile', () => {
  it('accepts .ts route files', () => {
    expect(isRouteFile('users/get.ts')).toBe(true);
    expect(isRouteFile('users/[id].ts')).toBe(true);
    expect(isRouteFile('users/[id?].ts')).toBe(true);
  });

  it('rejects files starting with _', () => {
    expect(isRouteFile('users/_middleware.ts')).toBe(false);
  });

  it('rejects test files', () => {
    expect(isRouteFile('users/get.test.ts')).toBe(false);
    expect(isRouteFile('users/get.spec.ts')).toBe(false);
  });

  it('rejects non-ts/js files', () => {
    expect(isRouteFile('users/schema.json')).toBe(false);
    expect(isRouteFile('users/README.md')).toBe(false);
  });
});
