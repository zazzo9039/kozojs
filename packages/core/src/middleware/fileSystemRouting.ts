import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Hono } from 'hono';

// ============================================
// MANIFEST TYPES
// ============================================

export type ManifestHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * A single route entry as written to routes-manifest.json
 */
export interface ManifestRoute {
  /** URL path, e.g. /users/:id */
  path: string;
  /** HTTP method (lowercase) */
  method: ManifestHttpMethod;
  /** Absolute or project-relative path to the handler file */
  handler: string;
  /** Named URL params extracted from the path, e.g. ['id'] */
  params: string[];
  /** Whether the handler module exports a body schema */
  hasBodySchema: boolean;
  /** Whether the handler module exports a query schema */
  hasQuerySchema: boolean;
}

/**
 * The shape of routes-manifest.json
 */
export interface RoutesManifest {
  version: number;
  generatedAt: string;
  routes: ManifestRoute[];
}

// ============================================
// OPTIONS
// ============================================

export interface FileSystemRoutingOptions {
  /**
   * Path to the routes-manifest.json file.
   * Defaults to `./routes-manifest.json` relative to cwd.
   */
  manifestPath?: string;

  /**
   * If true, log registered routes to stdout.
   * @default false
   */
  verbose?: boolean;

  /**
   * Called when the manifest is missing or unreadable.
   * Defaults to a silent no-op (backward-compatible behaviour).
   */
  onMissingManifest?: (reason: Error) => void;

  /**
   * Custom log function used when `verbose` is true.
   * Defaults to `console.log`.
   */
  logger?: (...args: unknown[]) => void;
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Read and parse routes-manifest.json.
 * Returns null when the file does not exist or is malformed.
 */
async function readManifest(
  manifestPath: string,
  onMissing: (err: Error) => void,
): Promise<RoutesManifest | null> {
  try {
    const raw = await readFile(manifestPath, 'utf-8');
    return JSON.parse(raw) as RoutesManifest;
  } catch (err) {
    onMissing(err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}

/**
 * Dynamically import a route handler module and return its default export.
 * Accepts both absolute paths and file:// URLs.
 */
async function importHandler(handlerPath: string): Promise<((...args: any[]) => any) | null> {
  try {
    const url = handlerPath.startsWith('file://')
      ? handlerPath
      : pathToFileURL(handlerPath).href;
    const mod = await import(url);
    if (typeof mod.default !== 'function') {
      console.warn(
        `[kozo:fsr] Skipping ${handlerPath}: no default export function`,
      );
      return null;
    }
    return mod.default as (...args: any[]) => any;
  } catch (err) {
    console.warn(
      `[kozo:fsr] Failed to import handler ${handlerPath}:`,
      (err as Error).message,
    );
    return null;
  }
}

// ============================================
// MIDDLEWARE FACTORY
// ============================================

/**
 * Register all routes declared in `routes-manifest.json` onto a Hono app.
 *
 * This function is **not** a Hono middleware in the classical sense — it is an
 * *async initializer* that must be awaited before the server starts accepting
 * requests. Calling it early (before user-defined routes) guarantees that
 * manifest routes take precedence.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { applyFileSystemRouting } from '@kozojs/core/middleware';
 *
 * const app = new Hono();
 * await applyFileSystemRouting(app, { manifestPath: './routes-manifest.json' });
 *
 * // User-defined routes registered AFTER are appended normally
 * app.get('/health', c => c.json({ ok: true }));
 * ```
 */
export async function applyFileSystemRouting(
  app: Hono<any>,
  options: FileSystemRoutingOptions = {},
): Promise<void> {
  const {
    manifestPath = resolve(process.cwd(), 'routes-manifest.json'),
    verbose = false,
    onMissingManifest = () => {
      // Silent by default — backward-compatible
    },
    logger = console.log,
  } = options;

  const manifest = await readManifest(manifestPath, onMissingManifest);

  // Gracefully skip when no manifest exists
  if (!manifest) return;

  const log = logger;

  if (verbose) {
    log(
      `\n📋 [kozo:fsr] Loading ${manifest.routes.length} route(s) from manifest\n`,
    );
  }

  for (const route of manifest.routes) {
    const handler = await importHandler(route.handler);
    if (!handler) continue;

    // Register on the Hono app using the correct HTTP method
    (app as any)[route.method](route.path, handler);

    if (verbose) {
      log(
        `   ${route.method.toUpperCase().padEnd(6)} ${route.path}  →  ${route.handler}`,
      );
    }
  }

  if (verbose) {
    log('');
  }
}

// ============================================
// CONVENIENCE: createFileSystemRouting
// ============================================

/**
 * Alternative factory that returns an async function you can call with a Hono
 * app. Useful when you want to pre-configure options and apply them later.
 *
 * @example
 * ```ts
 * const fsr = createFileSystemRouting({ verbose: true });
 * await fsr(app);
 * ```
 */
export function createFileSystemRouting(options: FileSystemRoutingOptions = {}) {
  return (app: Hono<any>) => applyFileSystemRouting(app, options);
}
