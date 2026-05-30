import { parse } from 'node:path';

// HTTP methods that can be used as filenames
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

export interface ParsedRoute {
  path: string;
  method: HttpMethod;
}

/**
 * Convert file path to URL path and HTTP method
 * 
 * Examples:
 *   users/index.ts          → GET   /users
 *   users/get.ts            → GET   /users
 *   users/post.ts           → POST  /users
 *   users/[id].ts           → GET   /users/:id
 *   users/[id]/get.ts       → GET   /users/:id
 *   users/[id]/patch.ts     → PATCH /users/:id
 *   users/[id?].ts          → GET   /users/:id?  (optional param)
 *   posts/[...slug].ts      → GET   /posts/*     (catch-all)
 *   health.ts               → GET   /health
 *   [id?]/posts/[postId?].ts → GET  /:id?/posts/:postId?
 */
export function fileToPath(filePath: string): ParsedRoute | null {
  // Normalize path separators
  const normalized = filePath.replace(/\\/g, '/');
  const parsed = parse(normalized);
  
  // Get filename without extension
  const filename = parsed.name.toLowerCase();
  
  // Determine HTTP method
  let method: HttpMethod = 'get';
  let includeName = true;
  
  if (HTTP_METHODS.includes(filename as HttpMethod)) {
    method = filename as HttpMethod;
    includeName = false;
  } else if (filename === 'index') {
    includeName = false;
  }
  
  // Build path from directory + optional filename
  let segments = parsed.dir ? parsed.dir.split('/').filter(Boolean) : [];
  
  if (includeName) {
    segments.push(parsed.name);
  }
  
  // Convert path segments
  const urlSegments = segments.map(segment => {
    // Catch-all: [...slug] → *
    if (segment.startsWith('[...') && segment.endsWith(']')) {
      return '*';
    }
    // Optional dynamic param: [id?] → :id?
    if (segment.startsWith('[') && segment.endsWith('?]')) {
      return ':' + segment.slice(1, -2) + '?';
    }
    // Dynamic param: [id] → :id
    if (segment.startsWith('[') && segment.endsWith(']')) {
      return ':' + segment.slice(1, -1);
    }
    return segment;
  });
  
  // Build final path
  let path = '/' + urlSegments.join('/');
  
  // Clean up
  path = path.replace(/\/+/g, '/');
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  
  return { path, method };
}

/**
 * Check if a file should be treated as a route
 */
export function isRouteFile(filename: string): boolean {
  // Skip files/directories where any segment starts with _
  const segments = filename.replace(/\\/g, '/').split('/');
  if (segments.some(s => s.startsWith('_'))) return false;
  
  // Skip test files
  if (filename.includes('.test.') || filename.includes('.spec.')) return false;
  
  // Must be .ts or .js
  return filename.endsWith('.ts') || filename.endsWith('.js');
}

/**
 * Check if a file is a per-directory middleware file.
 * Convention: `_middleware.ts` or `_middleware.js` in any route directory.
 */
export function isMiddlewareFile(filename: string): boolean {
  const normalized = filename.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? '';
  return /^_middleware\.(ts|js)$/.test(basename);
}
