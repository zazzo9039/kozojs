/**
 * Kozo Error System - RFC 7807 Problem Details
 *
 * Standardized error format for all validation and runtime errors.
 * Pre-serialized templates + frozen ResponseInit objects eliminate
 * per-request allocations on the hot path.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */

// ============================================================================
// Error Types
// ============================================================================

export interface ValidationError {
  field: string;
  path?: (string | number)[];
  message: string;
  code: string;
  value?: unknown;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: ValidationError[];
}

// ============================================================================
// Pre-compiled Error Responses (Zero allocation at runtime)
// ============================================================================

const CONTENT_TYPE_PROBLEM = 'application/problem+json';

export const ERROR_RESPONSES = {
  VALIDATION_FAILED: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#validation-failed',
    title: 'Validation Failed',
    status: 400,
  },
  INVALID_BODY: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#invalid-body',
    title: 'Invalid Request Body',
    status: 400,
  },
  INVALID_QUERY: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#invalid-query',
    title: 'Invalid Query Parameters',
    status: 400,
  },
  INVALID_PARAMS: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#invalid-params',
    title: 'Invalid Path Parameters',
    status: 400,
  },
  INTERNAL_ERROR: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#internal-error',
    title: 'Internal Server Error',
    status: 500,
  },
  NOT_FOUND: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#not-found',
    title: 'Resource Not Found',
    status: 404,
  },
  UNAUTHORIZED: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#unauthorized',
    title: 'Unauthorized',
    status: 401,
  },
  FORBIDDEN: {
    type: 'https://kozo-docs.vercel.app/docs/core/errors#forbidden',
    title: 'Forbidden',
    status: 403,
  },
} as const;

// ============================================================================
// Pre-allocated ResponseInit objects — shared header instance is a Headers
// object so that @hono/node-server can set Content-Length without hitting
// "object is not extensible" (it clones Headers but mutates plain objects).
// ============================================================================

const HDR_PROBLEM = new Headers({ 'Content-Type': CONTENT_TYPE_PROBLEM });

const INIT_400: ResponseInit = { status: 400, headers: HDR_PROBLEM };
const INIT_401: ResponseInit = { status: 401, headers: HDR_PROBLEM };
const INIT_403: ResponseInit = { status: 403, headers: HDR_PROBLEM };
const INIT_404: ResponseInit = { status: 404, headers: HDR_PROBLEM };
const INIT_500: ResponseInit = { status: 500, headers: HDR_PROBLEM };

// ============================================================================
// Error Formatters
// ============================================================================

/**
 * Convert validation errors (Zod-shaped) to standardized format.
 * Internal — called by validationErrorResponse.
 */
function formatValidationErrors(errors: any[] | null | undefined): ValidationError[] {
  if (!errors || errors.length === 0) return [];

  return errors.map(err => ({
    field: err.instancePath?.replace(/^\//, '').replace(/\//g, '.') || err.params?.missingProperty || 'unknown',
    path: err.path as (string | number)[] | undefined,
    message: err.message || 'Invalid value',
    code: err.keyword || 'invalid',
    value: err.data,
  }));
}

/**
 * Convert Zod validation errors to standardized format
 */
export function formatZodErrors(errors: any): ValidationError[] {
  if (!errors?.issues) return [];

  return errors.issues.map((issue: any) => ({
    field: issue.path?.join('.') || 'unknown',
    message: issue.message || 'Invalid value',
    code: issue.code || 'invalid',
    value: issue.input,
  }));
}

// ============================================================================
// Response Builders
//
// Hot-path functions (validationErrorResponse, internalErrorResponse) avoid
// any per-call object creation beyond the unavoidable JSON.stringify of the
// dynamic payload.
// ============================================================================

/**
 * Build a 400 Validation Failed response.
 * Called on every invalid request — kept as lean as possible.
 */
export function validationErrorResponse(
  field: string,
  ajvErrors: any[] | null | undefined,
  instance?: string,
): Response {
  const body: ProblemDetails = {
    type: ERROR_RESPONSES.VALIDATION_FAILED.type,
    title: ERROR_RESPONSES.VALIDATION_FAILED.title,
    status: 400,
    errors: formatValidationErrors(ajvErrors),
  };
  if (instance) body.instance = instance;
  return new Response(JSON.stringify(body), INIT_400);
}

/**
 * Build a 500 Internal Server Error response.
 */
export function internalErrorResponse(err: Error, instance?: string): Response {
  const body: ProblemDetails = {
    type: ERROR_RESPONSES.INTERNAL_ERROR.type,
    title: ERROR_RESPONSES.INTERNAL_ERROR.title,
    status: 500,
    // Only expose error message in development to avoid leaking sensitive info
    ...(process.env.NODE_ENV !== 'production' && err?.message ? { detail: err.message } : {}),
  };
  if (instance) body.instance = instance;
  return new Response(JSON.stringify(body), INIT_500);
}

/**
 * Build a 404 Not Found response.
 * Pre-serialized for the common case (no instance).
 */

// Pre-serialized static bodies — zero allocation for the common case
const BODY_404_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.NOT_FOUND.type,
  title: ERROR_RESPONSES.NOT_FOUND.title,
  status: 404,
});

export function notFoundResponse(instance?: string): Response {
  if (!instance) return new Response(BODY_404_STATIC, INIT_404);
  const body: ProblemDetails = {
    type: ERROR_RESPONSES.NOT_FOUND.type,
    title: ERROR_RESPONSES.NOT_FOUND.title,
    status: 404,
    instance,
  };
  return new Response(JSON.stringify(body), INIT_404);
}

/**
 * Build a 401 Unauthorized response.
 */

const BODY_401_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.UNAUTHORIZED.type,
  title: ERROR_RESPONSES.UNAUTHORIZED.title,
  status: 401,
});

export function unauthorizedResponse(instance?: string): Response {
  if (!instance) return new Response(BODY_401_STATIC, INIT_401);
  const body: ProblemDetails = {
    type: ERROR_RESPONSES.UNAUTHORIZED.type,
    title: ERROR_RESPONSES.UNAUTHORIZED.title,
    status: 401,
    instance,
  };
  return new Response(JSON.stringify(body), INIT_401);
}

/**
 * Build a 403 Forbidden response.
 */

const BODY_403_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.FORBIDDEN.type,
  title: ERROR_RESPONSES.FORBIDDEN.title,
  status: 403,
});

export function forbiddenResponse(instance?: string): Response {
  if (!instance) return new Response(BODY_403_STATIC, INIT_403);
  const body: ProblemDetails = {
    type: ERROR_RESPONSES.FORBIDDEN.type,
    title: ERROR_RESPONSES.FORBIDDEN.title,
    status: 403,
    instance,
  };
  return new Response(JSON.stringify(body), INIT_403);
}

/**
 * Build a 500 Internal Server Error response (static, no detail).
 */
const BODY_500_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.INTERNAL_ERROR.type,
  title: ERROR_RESPONSES.INTERNAL_ERROR.title,
  status: 500,
});

export function internalErrorResponseStatic(): Response {
  return new Response(BODY_500_STATIC, INIT_500);
}

/** RFC 7807 JSON body for 413 — shared by listen() and nativeListen(). */
export function bodyTooLargeJson(maxBytes: number): string {
  return JSON.stringify({
    type: 'about:blank',
    title: 'Content Too Large',
    status: 413,
    detail: `Request body exceeds the ${maxBytes}-byte limit`,
  });
}

// ============================================================================
// KozoError — Base Error Class
// ============================================================================

export class KozoError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'KozoError';
    this.statusCode = statusCode;
    this.code = code;
  }

  toResponse(instance?: string): Response {
    const body: ProblemDetails = {
      type: `https://kozo-docs.vercel.app/docs/core/errors#${this.code}`,
      title: this.message,
      status: this.statusCode,
    };
    if (instance) body.instance = instance;
    const init = _initForStatus(this.statusCode);
    return new Response(JSON.stringify(body), init);
  }
}

// Inline status → init lookup (avoids switch overhead for common codes)
function _initForStatus(status: number): ResponseInit {
  if (status === 400) return INIT_400;
  if (status === 401) return INIT_401;
  if (status === 403) return INIT_403;
  if (status === 404) return INIT_404;
  if (status === 500) return INIT_500;
  return { status, headers: new Headers({ 'Content-Type': CONTENT_TYPE_PROBLEM }) } as ResponseInit;
}

// ============================================================================
// Concrete Error Classes
// ============================================================================

export class ValidationFailedError extends KozoError {
  readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[] = []) {
    super(message, 400, 'validation-failed');
    this.name = 'ValidationFailedError';
    this.errors = errors;
  }

  override toResponse(instance?: string): Response {
    const body: ProblemDetails = {
      type: 'https://kozo-docs.vercel.app/docs/core/errors#validation-failed',
      title: this.message,
      status: 400,
      errors: this.errors,
    };
    if (instance) body.instance = instance;
    return new Response(JSON.stringify(body), INIT_400);
  }
}

export class NotFoundError extends KozoError {
  constructor(message = 'Resource Not Found') {
    super(message, 404, 'not-found');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends KozoError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends KozoError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'forbidden');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends KozoError {
  constructor(message = 'Conflict') {
    super(message, 409, 'conflict');
    this.name = 'ConflictError';
  }
}

export class GoneError extends KozoError {
  constructor(message = 'Gone') {
    super(message, 410, 'gone');
    this.name = 'GoneError';
  }
}

export class BadRequestError extends KozoError {
  constructor(message = 'Bad Request') {
    super(message, 400, 'bad-request');
    this.name = 'BadRequestError';
  }
}


