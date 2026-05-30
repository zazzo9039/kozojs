import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { glob } from 'glob';
import { scanRoutes, scanMiddleware, type ScannedRoute, type ScannedMiddleware } from './scan.js';

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

export interface RouteManifestEntry {
  /** URL path, e.g. /users/:id */
  path: string;
  /** HTTP method (lowercase) */
  method: string;
  /** Relative path from project root to the handler file */
  handler: string;
  /** Dynamic URL parameter names */
  params: string[];
  /** Whether the handler exports a body schema */
  hasBodySchema: boolean;
  /** Whether the handler exports a query schema */
  hasQuerySchema: boolean;
}

export interface MiddlewareManifestEntry {
  /** URL path prefix this middleware applies to, e.g. '/admin/*' */
  pathPrefix: string;
  /** Relative path from routesDir to the _middleware.ts file */
  handler: string;
}

export interface RoutesManifest {
  /** Schema version — bump when shape changes */
  version: number;
  /** ISO timestamp of last generation */
  generatedAt: string;
  /** SHA-256 hash of all route + middleware file contents at generation time */
  contentHash: string;
  /** All discovered routes */
  routes: RouteManifestEntry[];
  /** Per-directory middleware, sorted by depth (root first) */
  middleware: MiddlewareManifestEntry[];
}

// ---------------------------------------------------------------------------
// Hashing helpers
// ---------------------------------------------------------------------------

/**
 * Compute a stable SHA-256 hash over every route file's content.
 * Files are sorted by path before hashing to ensure determinism.
 */
async function hashRouteFiles(routesDir: string): Promise<string> {
  // Include both route files and _middleware files in the hash
  const routeFiles = await glob('**/*.{ts,js}', {
    cwd: routesDir,
    nodir: true,
    ignore: ['**/_*.ts', '**/_*.js', '**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js'],
  });
  const middlewareFiles = await glob('**/_middleware.{ts,js}', {
    cwd: routesDir,
    nodir: true,
  });

  const files = [...new Set([...routeFiles, ...middlewareFiles])];
  files.sort();

  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file); // include filename in hash
    try {
      const content = readFileSync(join(routesDir, file));
      hash.update(content);
    } catch {
      // file disappeared between glob and read — skip
    }
  }

  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function readExistingManifest(manifestPath: string): RoutesManifest | null {
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw) as RoutesManifest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateManifestOptions {
  /** Absolute path to the routes directory */
  routesDir: string;
  /** Absolute path to the project root (used to compute relative handler paths) */
  projectRoot: string;
  /** Where to write routes-manifest.json; defaults to <projectRoot>/routes-manifest.json */
  outputPath?: string;
  /** Skip regeneration if content hash is unchanged */
  cache?: boolean;
  /** Print status messages */
  verbose?: boolean;
}

/**
 * Generate (or refresh from cache) a routes-manifest.json file.
 *
 * Returns the manifest that was written (or the cached one if unchanged).
 */
export async function generateManifest(options: GenerateManifestOptions): Promise<RoutesManifest> {
  const {
    routesDir,
    projectRoot,
    outputPath = join(projectRoot, 'routes-manifest.json'),
    cache = true,
    verbose = false,
  } = options;

  // ------------------------------------------------------------------
  // 1. Compute content hash of current route files
  // ------------------------------------------------------------------
  const contentHash = await hashRouteFiles(routesDir);

  // ------------------------------------------------------------------
  // 2. Check cache — skip if hash unchanged
  // ------------------------------------------------------------------
  if (cache) {
    const existing = readExistingManifest(outputPath);
    if (existing && existing.contentHash === contentHash && existing.version === MANIFEST_VERSION) {
      if (verbose) {
        console.log(`  ✓ routes-manifest.json up-to-date (hash: ${contentHash.slice(0, 8)}…)`);
      }
      return existing;
    }
  }

  // ------------------------------------------------------------------
  // 3. Scan routes
  // ------------------------------------------------------------------
  if (verbose) {
    console.log(`  Scanning routes in: ${routesDir}`);
  }

  const scanned: ScannedRoute[] = await scanRoutes({ routesDir, verbose: false });
  const scannedMiddleware: ScannedMiddleware[] = await scanMiddleware({ routesDir, verbose: false });

  // ------------------------------------------------------------------
  // 4. Build manifest entries (convert absolute handler paths → relative)
  // ------------------------------------------------------------------
  const entries: RouteManifestEntry[] = scanned.map(r => ({
    path: r.path,
    method: r.method,
    handler: r.relativePath, // relative to routesDir; callers can join with projectRoot
    params: r.params,
    hasBodySchema: r.hasBodySchema,
    hasQuerySchema: r.hasQuerySchema,
  }));

  const middlewareEntries: MiddlewareManifestEntry[] = scannedMiddleware.map(m => ({
    pathPrefix: m.pathPrefix,
    handler: m.relativePath,
  }));

  const manifest: RoutesManifest = {
    version: MANIFEST_VERSION,
    generatedAt: new Date().toISOString(),
    contentHash,
    routes: entries,
    middleware: middlewareEntries,
  };

  // ------------------------------------------------------------------
  // 5. Write to disk
  // ------------------------------------------------------------------
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  if (verbose) {
    console.log(`  ✓ Generated routes-manifest.json (${entries.length} routes, ${middlewareEntries.length} middleware, hash: ${contentHash.slice(0, 8)}…)`);
  }

  return manifest;
}

/** Current manifest schema version — bump when RoutesManifest shape changes */
export const MANIFEST_VERSION = 2;
