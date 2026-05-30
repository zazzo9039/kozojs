import { glob } from 'glob';
import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';

// HTTP methods that can be used as filenames
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

export interface ScannedRoute {
  /** URL path, e.g. /users/:id */
  path: string;
  /** HTTP method */
  method: HttpMethod;
  /** Absolute path to the handler file */
  handler: string;
  /** Relative path from routesDir, e.g. users/[id]/get.ts */
  relativePath: string;
  /** Dynamic parameter names extracted from the path */
  params: string[];
  /** Whether the source file exports a body schema */
  hasBodySchema: boolean;
  /** Whether the source file exports a query schema */
  hasQuerySchema: boolean;
}

export interface ScanOptions {
  /** Absolute path to the routes directory */
  routesDir: string;
  /** Print discovered routes to stdout */
  verbose?: boolean;
}

// ---------------------------------------------------------------------------
// File-path → URL-path conversion (mirrors core/src/utils/file-to-path.ts)
// ---------------------------------------------------------------------------

function fileToRoute(filePath: string): { path: string; method: HttpMethod } | null {
  // Normalize separators
  const normalized = filePath.replace(/\\/g, '/');
  const lastDot = normalized.lastIndexOf('.');
  const withoutExt = lastDot !== -1 ? normalized.slice(0, lastDot) : normalized;

  const parts = withoutExt.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1].toLowerCase();
  let method: HttpMethod = 'get';
  let includeLast = true;

  if (HTTP_METHODS.includes(last as HttpMethod)) {
    method = last as HttpMethod;
    includeLast = false;
  } else if (last === 'index') {
    includeLast = false;
  }

  const segments = includeLast ? parts : parts.slice(0, -1);

  const urlSegments = segments.map(seg => {
    if (seg.startsWith('[...') && seg.endsWith(']')) return '*';
    if (seg.startsWith('[') && seg.endsWith(']')) return ':' + seg.slice(1, -1);
    return seg;
  });

  const path = '/' + urlSegments.join('/');
  return { path, method };
}

/** Extract :param names from a URL path string */
function extractParams(urlPath: string): string[] {
  return urlPath
    .split('/')
    .filter(seg => seg.startsWith(':'))
    .map(seg => seg.slice(1));
}

/** Determine whether a file is a valid route file (not private/test) */
function isRouteFile(file: string): boolean {
  const name = file.split('/').pop() ?? '';
  if (name.startsWith('_')) return false;
  if (name.includes('.test.') || name.includes('.spec.')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Static analysis — detect schema exports without importing the module
// ---------------------------------------------------------------------------

function detectSchemas(absolutePath: string): { hasBodySchema: boolean; hasQuerySchema: boolean } {
  let source = '';
  try {
    source = readFileSync(absolutePath, 'utf8');
  } catch {
    return { hasBodySchema: false, hasQuerySchema: false };
  }

  // Look for exported identifiers named bodySchema / body / querySchema / query
  // Handles: export const bodySchema = ..., export { bodySchema }, export type ...
  const hasBodySchema =
    /export\s+(const|let|var)\s+body(Schema)?\s*[=:]/.test(source) ||
    /export\s+\{[^}]*\bbody(Schema)?\b[^}]*\}/.test(source);

  const hasQuerySchema =
    /export\s+(const|let|var)\s+query(Schema)?\s*[=:]/.test(source) ||
    /export\s+\{[^}]*\bquery(Schema)?\b[^}]*\}/.test(source);

  return { hasBodySchema, hasQuerySchema };
}

// ---------------------------------------------------------------------------
// Route priority scoring (mirrors core/src/router.ts)
// ---------------------------------------------------------------------------

function routeScore(urlPath: string): number {
  const segments = urlPath.split('/').filter(Boolean);
  let score = segments.length * 10;
  for (const seg of segments) {
    if (seg === '*') score -= 100;
    else if (seg.startsWith(':')) score -= 5;
    else score += 1;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a routes directory and return structured route metadata.
 * This is a pure file-system operation — it does NOT import route modules.
 */
export async function scanRoutes(options: ScanOptions): Promise<ScannedRoute[]> {
  const { routesDir, verbose = false } = options;

  const files = await glob('**/*.{ts,js}', {
    cwd: routesDir,
    nodir: true,
    ignore: ['**/_*.ts', '**/_*.js', '**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'],
  });

  const routes: ScannedRoute[] = [];

  for (const file of files) {
    if (!isRouteFile(file)) continue;

    const parsed = fileToRoute(file);
    if (!parsed) continue;

    const absolutePath = join(routesDir, file);
    const { hasBodySchema, hasQuerySchema } = detectSchemas(absolutePath);
    const params = extractParams(parsed.path);

    routes.push({
      path: parsed.path,
      method: parsed.method,
      handler: absolutePath,
      relativePath: file,
      params,
      hasBodySchema,
      hasQuerySchema,
    });
  }

  // Sort: static paths first, longer paths first, catch-alls last
  routes.sort((a, b) => routeScore(b.path) - routeScore(a.path));

  if (verbose) {
    for (const r of routes) {
      const method = r.method.toUpperCase().padEnd(6);
      console.log(`  ${method} ${r.path}  (${r.relativePath})`);
    }
  }

  return routes;
}

// ---------------------------------------------------------------------------
// Middleware scanning
// ---------------------------------------------------------------------------

export interface ScannedMiddleware {
  /** URL path prefix, e.g. '/admin/*' */
  pathPrefix: string;
  /** Absolute path to the _middleware.ts file */
  handler: string;
  /** Relative path from routesDir, e.g. admin/_middleware.ts */
  relativePath: string;
}

/**
 * Scan a routes directory for `_middleware.ts` / `_middleware.js` files.
 *
 * This is a pure file-system operation — it does NOT import the modules.
 * Results are sorted by directory depth (root middleware first).
 */
export async function scanMiddleware(options: ScanOptions): Promise<ScannedMiddleware[]> {
  const { routesDir, verbose = false } = options;

  const files = await glob('**/_middleware.{ts,js}', {
    cwd: routesDir,
    nodir: true,
  });

  const middlewares: ScannedMiddleware[] = files.map(file => {
    const dir = file.replace(/\\/g, '/').replace(/\/_middleware\.(ts|js)$/, '').replace(/_middleware\.(ts|js)$/, '');
    const pathPrefix = dir ? `/${dir}/*` : '/*';
    return {
      pathPrefix,
      handler: join(routesDir, file),
      relativePath: file,
    };
  });

  // Sort by depth (root first)
  middlewares.sort((a, b) => {
    const depthA = a.pathPrefix.split('/').length;
    const depthB = b.pathPrefix.split('/').length;
    return depthA - depthB;
  });

  if (verbose) {
    for (const mw of middlewares) {
      console.log(`  🛡️  ${mw.pathPrefix.padEnd(30)} (${mw.relativePath})`);
    }
  }

  return middlewares;
}
