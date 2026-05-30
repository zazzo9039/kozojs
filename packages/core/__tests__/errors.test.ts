// ============================================================================
// Tests for errors.ts — KozoError, subclasses, response builders
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  KozoError,
  ValidationFailedError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  GoneError,
  BadRequestError,
  validationErrorResponse,
  internalErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponseStatic,
  formatZodErrors,
  ERROR_RESPONSES,
} from '../src/errors.js';

// ── KozoError ────────────────────────────────────────────────────────────

describe('KozoError', () => {
  it('has correct properties', () => {
    const err = new KozoError('test error', 418, 'teapot');
    expect(err.message).toBe('test error');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('teapot');
    expect(err.name).toBe('KozoError');
    expect(err).toBeInstanceOf(Error);
  });

  it('toResponse returns correct status and RFC 7807 body', async () => {
    const err = new KozoError('fail', 400, 'bad-request');
    const res = err.toResponse('/api/test');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toContain('bad-request');
    expect(body.title).toBe('fail');
    expect(body.status).toBe(400);
    expect(body.instance).toBe('/api/test');
  });

  it('toResponse without instance omits it', async () => {
    const err = new KozoError('no instance', 500, 'error');
    const body = await err.toResponse().json();
    expect(body.instance).toBeUndefined();
  });

  it('toResponse uses correct Content-Type', () => {
    const err = new KozoError('test', 404, 'not-found');
    const res = err.toResponse();
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  });
});

// ── Concrete error classes ───────────────────────────────────────────────

describe('Error subclasses', () => {
  it('NotFoundError defaults', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('not-found');
    expect(err.message).toBe('Resource Not Found');
    expect(err.name).toBe('NotFoundError');
  });

  it('UnauthorizedError defaults', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('unauthorized');
  });

  it('ForbiddenError defaults', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('forbidden');
  });

  it('ConflictError defaults', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('conflict');
  });

  it('GoneError defaults', () => {
    const err = new GoneError();
    expect(err.statusCode).toBe(410);
    expect(err.code).toBe('gone');
  });

  it('BadRequestError defaults', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('bad-request');
  });

  it('custom messages override defaults', () => {
    const err = new NotFoundError('User not found');
    expect(err.message).toBe('User not found');
  });
});

// ── ValidationFailedError ────────────────────────────────────────────────

describe('ValidationFailedError', () => {
  it('stores errors array', () => {
    const errors = [{ field: 'name', message: 'required', code: 'required' }];
    const err = new ValidationFailedError('Validation failed', errors);
    expect(err.statusCode).toBe(400);
    expect(err.errors).toBe(errors);
  });

  it('toResponse includes errors in body', async () => {
    const errors = [{ field: 'email', message: 'invalid', code: 'invalid' }];
    const err = new ValidationFailedError('Bad input', errors);
    const body = await err.toResponse('/register').json();
    expect(body.status).toBe(400);
    expect(body.errors).toEqual(errors);
    expect(body.instance).toBe('/register');
  });
});

// ── Response builders ────────────────────────────────────────────────────

describe('validationErrorResponse', () => {
  it('returns 400 with RFC 7807 body', async () => {
    const errors = [{ instancePath: '/name', message: 'Expected string', keyword: 'type' }];
    const res = validationErrorResponse('body', errors, '/api/users');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toContain('validation-failed');
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].field).toBe('name');
    expect(body.instance).toBe('/api/users');
  });

  it('handles null errors', async () => {
    const res = validationErrorResponse('body', null);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toEqual([]);
  });
});

describe('internalErrorResponse', () => {
  const origEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = origEnv; });

  it('returns 500 with detail in non-production', async () => {
    process.env.NODE_ENV = 'development';
    const res = internalErrorResponse(new Error('db crash'), '/api/test');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.detail).toBe('db crash');
    expect(body.instance).toBe('/api/test');
  });

  it('omits detail in production', async () => {
    process.env.NODE_ENV = 'production';
    const res = internalErrorResponse(new Error('secret'), '/api/test');
    const body = await res.json();
    expect(body.detail).toBeUndefined();
  });
});

describe('notFoundResponse', () => {
  it('returns 404 static (no instance)', async () => {
    const res = notFoundResponse();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe(404);
    expect(body.instance).toBeUndefined();
  });

  it('returns 404 with instance', async () => {
    const res = notFoundResponse('/api/users/999');
    const body = await res.json();
    expect(body.instance).toBe('/api/users/999');
  });
});

describe('unauthorizedResponse', () => {
  it('returns 401 static', async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
  });

  it('returns 401 with instance', async () => {
    const body = await unauthorizedResponse('/api/admin').json();
    expect(body.instance).toBe('/api/admin');
  });
});

describe('forbiddenResponse', () => {
  it('returns 403 static', async () => {
    const res = forbiddenResponse();
    expect(res.status).toBe(403);
  });

  it('returns 403 with instance', async () => {
    const body = await forbiddenResponse('/api/secret').json();
    expect(body.instance).toBe('/api/secret');
  });
});

describe('internalErrorResponseStatic', () => {
  it('returns 500 with no dynamic content', async () => {
    const res = internalErrorResponseStatic();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe(500);
    expect(body.detail).toBeUndefined();
  });
});

// ── formatZodErrors ──────────────────────────────────────────────────────

describe('formatZodErrors', () => {
  it('converts Zod issues to ValidationError format', () => {
    const zodError = {
      issues: [
        { path: ['name'], message: 'Required', code: 'invalid_type', input: undefined },
        { path: ['age'], message: 'Too small', code: 'too_small', input: -1 },
      ],
    };
    const result = formatZodErrors(zodError);
    expect(result).toHaveLength(2);
    expect(result[0].field).toBe('name');
    expect(result[0].message).toBe('Required');
    expect(result[1].field).toBe('age');
  });

  it('returns empty array for null input', () => {
    expect(formatZodErrors(null)).toEqual([]);
    expect(formatZodErrors(undefined)).toEqual([]);
    expect(formatZodErrors({})).toEqual([]);
  });
});

// ── ERROR_RESPONSES constants ────────────────────────────────────────────

describe('ERROR_RESPONSES', () => {
  it('has all expected error types', () => {
    expect(ERROR_RESPONSES.VALIDATION_FAILED.status).toBe(400);
    expect(ERROR_RESPONSES.INTERNAL_ERROR.status).toBe(500);
    expect(ERROR_RESPONSES.NOT_FOUND.status).toBe(404);
    expect(ERROR_RESPONSES.UNAUTHORIZED.status).toBe(401);
    expect(ERROR_RESPONSES.FORBIDDEN.status).toBe(403);
  });
});
