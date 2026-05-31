import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MiddlewareHandler } from 'hono';
import type {
  RouteDefinition,
  RouteModule,
  RouteSchema,
  ResolvedRouteModule,
  RouteDefinitionOptions,
  KozoHandler,
  HttpMethod,
  MiddlewareDefinition,
  KozoEnv,
} from './types.js';
import { fileToPath, isRouteFile, isMiddlewareFile } from './utils/file-to-path.js';

/** Recursively list *.ts and *.js files, skipping underscore/test/spec files */
async function scanFiles(dir: string, base = ''): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      results.push(...await scanFiles(join(dir, e.name), rel));
    } else if (/\.(ts|js)$/.test(e.name) &&
               !e.name.startsWith('_') &&
               !e.name.endsWith('.test.ts') && !e.name.endsWith('.test.js') &&
               !e.name.endsWith('.spec.ts') && !e.name.endsWith('.spec.js')) {
      results.push(rel);
    }
  }
  return results;
}

/** Recursively list _middleware.ts / _middleware.js files */
async function scanMiddlewareFiles(dir: string, base = ''): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const rel = base ? `${base}/${e.name}` : e.name;
      results.push(...await scanMiddlewareFiles(join(dir, e.name), rel));
    } else if (isMiddlewareFile(e.name)) {
      results.push(base ? `${base}/${e.name}` : e.name);
    }
  }
  return results;
}

export interface ScanOptions {
  routesDir: string;
  verbose?: boolean;
}

function isRouteDefinitionOptions(value: unknown): value is RouteDefinitionOptions {
  return (
    value !== null &&
    typeof value === 'object' &&
    'handler' in value &&
    typeof (value as RouteDefinitionOptions).handler === 'function'
  );
}

/** Normalize a dynamically imported route module to handler + schema + meta. */
export function resolveRouteModule<S extends RouteSchema = RouteSchema>(
  module: RouteModule<S>,
): ResolvedRouteModule<S> | null {
  const d = module.default;

  if (isRouteDefinitionOptions(d)) {
    return {
      handler: d.handler as KozoHandler<S>,
      schema: (d.schema ?? module.schema ?? {}) as S,
      meta: d.meta ?? module.meta,
    };
  }

  if (typeof d === 'function') {
    return {
      handler: d as KozoHandler<S>,
      schema: (module.schema ?? {}) as S,
      meta: module.meta,
    };
  }

  return null;
}

/**
 * Scan routes directory and return route definitions
 */
export async function scanRoutes(options: ScanOptions): Promise<RouteDefinition[]> {
  const { routesDir, verbose = true } = options;

  if (verbose) {
    console.log(`\n🔍 Scanning routes in: ${routesDir}\n`);
  }

  // Find all .ts and .js files
  const files = await scanFiles(routesDir);

  // Parallel import with Promise.allSettled — one broken file doesn't block others
  const results = await Promise.allSettled(
    files
      .filter(isRouteFile)
      .map(async (file) => {
        const parsed = fileToPath(file);
        if (!parsed) return null;

        const fullPath = join(routesDir, file);
        const fileUrl = pathToFileURL(fullPath).href;
        const module = await import(fileUrl) as RouteModule;

        if (!resolveRouteModule(module)) {
          return { type: 'no-export' as const, file };
        }

        return {
          type: 'route' as const,
          path: parsed.path,
          method: parsed.method,
          filePath: fullPath,
          module,
        };
      })
  );

  const routes: RouteDefinition[] = [];

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(`❌ Failed to load route: ${r.reason}`);
      continue;
    }
    const val = r.value;
    if (!val) continue;
    if (val.type === 'no-export') {
      if (verbose) console.warn(`⚠️  Skipping ${val.file}: no default export (function or { handler })`);
      continue;
    }
    routes.push({
      path: val.path,
      method: val.method,
      filePath: val.filePath,
      module: val.module,
    });
    if (verbose) {
      const methodLabel = val.method.toUpperCase().padEnd(6);
      console.log(`   ${methodLabel} ${val.path}`);
    }
  }

  if (verbose) {
    console.log(`\n✅ Loaded ${routes.length} routes\n`);
  }

  // Sort routes: static paths before dynamic, longer paths first
  // Tiebreaker: lexicographic path order for deterministic sorting
  routes.sort((a, b) => {
    const diff = routeScore(b.path) - routeScore(a.path);
    if (diff !== 0) return diff;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  return routes;
}

/**
 * Score a route for sorting (higher = more priority)
 * Static paths get higher scores than dynamic ones
 */
function routeScore(path: string): number {
  const segments = path.split('/').filter(Boolean);
  let score = segments.length * 10;

  for (const segment of segments) {
    if (segment === '*') {
      score -= 100; // Catch-all has lowest priority
    } else if (segment.startsWith(':')) {
      score -= 5; // Dynamic params have lower priority
    } else {
      score += 1; // Static segments increase priority
    }
  }

  return score;
}

export { fileToPath, isRouteFile };

// ============================================
// PER-DIRECTORY MIDDLEWARE SCANNING
// ============================================

/**
 * Scan for `_middleware.ts` / `_middleware.js` files in the routes directory tree.
 *
 * Each file is dynamically imported and its default export registered as Hono
 * middleware scoped to that directory's URL prefix:
 *
 *   routes/_middleware.ts        → `app.use('/*', mw)`       (global)
 *   routes/admin/_middleware.ts  → `app.use('/admin/*', mw)` (scoped)
 *   routes/admin/users/_middleware.ts → `app.use('/admin/users/*', mw)`
 *
 * Returns definitions sorted by path depth (root first) so that parent
 * middleware always runs before child middleware.
 */
export async function scanMiddleware(options: ScanOptions): Promise<MiddlewareDefinition[]> {
  const { routesDir, verbose = false } = options;

  const files = await scanMiddlewareFiles(routesDir);
  const definitions: MiddlewareDefinition[] = [];

  for (const file of files) {
    const fullPath = join(routesDir, file);
    const fileUrl = pathToFileURL(fullPath).href;

    try {
      const mod = await import(fileUrl);
      const handler = mod.default;

      if (typeof handler !== 'function') {
        if (verbose) console.warn(`⚠️  Skipping ${file}: no default export function`);
        continue;
      }

      // Derive the URL path prefix from the file's directory:
      //   _middleware.ts          → '/*'
      //   admin/_middleware.ts    → '/admin/*'
      const dir = file.replace(/\\/g, '/').replace(/\/_middleware\.(ts|js)$/, '').replace(/_middleware\.(ts|js)$/, '');
      const pathPrefix = dir ? `/${dir}/*` : '/*';

      definitions.push({ pathPrefix, handler, filePath: fullPath });

      if (verbose) {
        console.log(`   🛡️  ${pathPrefix.padEnd(30)} ← ${file}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load middleware ${file}:`, (err as Error).message);
    }
  }

  // Sort by depth (root middleware first)
  definitions.sort((a, b) => {
    const depthA = a.pathPrefix.split('/').length;
    const depthB = b.pathPrefix.split('/').length;
    return depthA - depthB;
  });

  return definitions;
}
