// ============================================
// KOZO V2 - High-Performance Framework
// ============================================

// Main exports
export { Kozo, createKozo } from './app.js';
export type { Plugin } from './app.js';
export { KozoGroup } from './app.js';
export type { KozoConfig } from './types.js';

// Types
export type {
  Services,
  RouteSchema,
  RouteMeta,
  RouteModule,
  MiddlewareDefinition,
  KozoContext,
  KozoHandler,
  KozoEnv,
  KozoUser,
  KozoRequest,
  NativeKozoContext,
  NativeKozoHandler,
  InferSchema,
  InferResponse,
  Infer,
} from './types.js';

// Client SDK Generation
export { generateTypedClient } from './client-generator.js';
export type {
  ClientGeneratorOptions,
  RouteInfo
} from './client-generator.js';

// Advanced: Route Compilation (La Chiave di Volta)
export { SchemaCompiler, compileRouteHandler } from './compiler.js';
export type { CompiledRoute } from './compiler.js';

// Native context builder (for power-user native handlers)
export { buildNativeContext } from './native-context.js';

// Fast response utilities (for custom native middleware / handlers)
export {
  fastWriteJson,
  fastWriteText,
  fastWriteHtml,
  fastWriteJsonStatus,
  fastWrite404,
  fastWrite500,
  fastWrite400,
  fastWriteError,
  fastCL,
} from './fast-response.js';

// Error System (RFC 7807 Problem Details)
export {
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
  formatZodErrors,
  ERROR_RESPONSES,
} from './errors.js';
export type {
  ValidationError,
  ProblemDetails,
} from './errors.js';

// Re-export Zod for convenience
export { z } from 'zod';

// Graceful Shutdown
export {
  ShutdownManager,
  createShutdownManager,
  createInflightTracker,
  trackRequest,
} from './shutdown.js';
export type { ShutdownOptions, ShutdownState, InflightTracker } from './shutdown.js';

// OpenAPI Generation
export {
  OpenAPIGenerator,
  createOpenAPIGenerator,
  generateSwaggerHtml,
} from './openapi.js';
export type {
  OpenAPIConfig,
  OpenAPIInfo,
  OpenAPISpec,
} from './openapi.js';

// SSR (Vite Server-Side Rendering integration)
export { createSsrServer } from './ssr.js';
export type {
  SsrConfig,
  SsrRenderFn,
  SsrRenderResult,
} from './ssr.js';

// WebSocket
export type {
  KozoWebSocket,
  WebSocketHandler,
  WsUpgradeRequest,
} from './ws.js';

// Middleware
export * from './middleware/index.js';

// Route & Middleware Scanning (advanced / CLI tooling)
export { scanRoutes, scanMiddleware } from './router.js';
export { fileToPath, isRouteFile, isMiddlewareFile } from './utils/file-to-path.js';

// Schema Helpers + utilities (reduce boilerplate)
export {
  paginationSchema,
  uuidParams,
  idParams,
  deletedSchema,
  timestamps,
  sortSchema,
  searchSchema,
  successSchema,
  defineEnv,
  paginate,
  uuid,
} from './helpers.js';
export type { PaginatedResult } from './helpers.js';
