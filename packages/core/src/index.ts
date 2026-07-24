// ============================================
// KOZO V2 - High-Performance Framework
// ============================================

// Main exports
export { Kozo, createKozo } from './app.js';
export type { Plugin, MountDocsOptions } from './app.js';
export { KozoGroup } from './app.js';
export {
  defineKozoApp,
  buildKozoApp,
  renderKozoTypesDts,
  KOZO_CONFIG_CANDIDATES,
  KOZO_TYPES_CANDIDATES,
  KOZO_TYPES_OUTPUT,
} from './kozo-app.js';
export type {
  KozoAppDefinition,
  KozoAppTypesRef,
  KozoAppHooks,
  DefineKozoAppOptions,
} from './kozo-app.js';
export type { KozoConfig } from './types.js';

// Types
export type {
  Services,
  RouteSchema,
  RouteMeta,
  RouteModule,
  RouteDefinitionOptions,
  ResolvedRouteModule,
  MiddlewareDefinition,
  KozoContext,
  KozoHandler,
  KozoEnv,
  KozoUser,
  KozoServices,
  RouteContext,
  KozoRequest,
  NativeKozoContext,
  NativeKozoHandler,
  InferSchema,
  InferResponse,
  Infer,
} from './types.js';
export { defineRoute, createRouteFactory } from './types.js';

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

// Guards (transport-agnostic security — native speed under uWS)
export {
  guardToHonoMiddleware,
  compileGuardPattern,
} from './guard.js';
export type {
  KozoGuard,
  GuardRequest,
  GuardResult,
  GuardOutcome,
  GuardDeny,
  GuardEntry,
} from './guard.js';

// Middleware
export * from './middleware/index.js';

// Route & Middleware Scanning (advanced / CLI tooling)
export { scanRoutes, scanMiddleware, resolveRouteModule } from './router.js';
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
  requireSecret,
  paginate,
  uuid,
} from './helpers.js';
export type { PaginatedResult, RequireSecretOptions } from './helpers.js';

// Secret hygiene — shared by requireSecret() and the @kozojs/auth guards
export {
  MIN_SECRET_BYTES,
  GENERATE_SECRET_COMMAND,
  KNOWN_WEAK_SECRETS,
  isKnownWeakSecret,
  secretByteLength,
  assertStrongSecret,
} from './weak-secrets.js';
export type { AssertStrongSecretOptions } from './weak-secrets.js';
