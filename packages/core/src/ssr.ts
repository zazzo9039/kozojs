// ============================================================================
// Kozo SSR — Vite-based Server-Side Rendering integration
// ============================================================================
//
// Provides a unified server that handles both API routes (via Hono) and
// SSR-rendered pages (via Vite + React/Vue/Svelte) from a single process.
//
// Dev mode:  Vite middleware for HMR + optional ssrLoadModule for live SSR
// Prod mode: Static file serving from dist/ + pre-built SSR render function
//
// Usage:
//   const app = createKozo({ routesDir: './src/routes' });
//   await app.loadRoutes();
//   await app.listenSsr(3000, {
//     root: path.resolve(__dirname, '../web'),
//     entryServer: 'src/entry-server.tsx',
//   });
//
// This replaces the need for a separate Node HTTP server for SSR.
// ============================================================================

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'node:http';
import { Writable } from 'node:stream';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';

// ── Types ────────────────────────────────────────────────────────────────

/**
 * Result returned by the user's SSR `render(url)` function.
 *
 * String mode (default):
 *   Return `{ html, head? }` — the entire page is buffered before sending.
 *
 * Streaming mode (React 18 renderToPipeableStream):
 *   Return `{ pipe, head? }` — headers are flushed immediately and HTML is
 *   streamed as Suspense boundaries resolve, improving TTFB.
 */
export type SsrRenderResult =
  | { html: string; head?: string }
  | { pipe: (destination: Writable) => void; head?: string };

/** The render function exported by the SSR server entry module. */
export type SsrRenderFn = (url: string) => SsrRenderResult | Promise<SsrRenderResult>;

/** Configuration for Kozo SSR integration. */
export interface SsrConfig {
  /** Root directory of the web app (where index.html & vite.config live). */
  root: string;
  /** Path to the server entry module — relative to root (e.g. 'src/entry-server.tsx'). */
  entryServer: string;
  /** Path to the HTML template — relative to root (default: 'index.html'). */
  template?: string;
  /** Placeholder replaced with rendered app HTML (default: '<!--app-html-->'). */
  appPlaceholder?: string;
  /** Placeholder replaced with &lt;head&gt; tags (default: '<!--ssr-head-->'). */
  headPlaceholder?: string;
  /** Directory for built client assets — relative to root (default: 'dist/client'). */
  distClient?: string;
  /** Directory for server bundle — relative to root (default: 'dist/server'). */
  distServer?: string;
  /** URL prefix(es) for routes that bypass SSR and go to Hono (default: '/api'). */
  apiPrefix?: string | string[];
  /**
   * Enable SSR rendering in dev mode.
   *
   * Default: **auto-detected** — if `index.html` contains the app placeholder
   * (`<!--app-html-->`) SSR is enabled automatically, so projects using
   * `entry-server.tsx` + `hydrateRoot` work without any extra config.
   *
   * Set explicitly to `false` to force CSR mode (recommended with
   * `@tailwindcss/vite` v4 to avoid FOUC caused by CSS-in-JS injection).
   */
  devSsr?: boolean;
  /**
   * Critical CSS injected into &lt;head&gt; in dev mode to prevent FOUC.
   * Only applies when devSsr is false (CSR mode).
   * Default: dark background + hidden root until JS loads.
   */
  devCriticalCss?: string;
}

// ── MIME type map ───────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
};

/** Regex for hashed assets — served with immutable cache headers. */
const IMMUTABLE_RE = /[.-][a-f0-9]{8,}\.(js|css|svg|png|jpg|jpeg|gif|webp|woff2?)$/i;

// ── Static asset cache ──────────────────────────────────────────────────

/** Cache entry for static assets. */
interface StaticCacheEntry {
  content: Buffer;
  mime: string;
  size: number;
}

/** In-memory cache for small static assets (< 1MB). Reduces fs.stat + fs.readFile overhead. */
const STATIC_CACHE = new Map<string, StaticCacheEntry>();
const MAX_CACHE_SIZE = 1024 * 1024; // 1MB max per cached file
let cacheSize = 0;

/** Evict oldest entries (LRU via Map insertion order) if cache exceeds 50MB total. */
function evictIfNeeded(): void {
  if (cacheSize <= 50 * 1024 * 1024) return;
  // Iterate in insertion order (oldest first) — no array allocation
  for (const [key, entry] of STATIC_CACHE) {
    STATIC_CACHE.delete(key);
    cacheSize -= entry.size;
    if (cacheSize <= 40 * 1024 * 1024) break;
  }
}

// ── Streaming helpers ──────────────────────────────────────────────────

/** Split template at the app placeholder into [head, tail]. */
function splitAtPlaceholder(tpl: string, placeholder: string): [string, string] {
  const idx = tpl.indexOf(placeholder);
  if (idx === -1) return [tpl, ''];
  return [tpl.slice(0, idx), tpl.slice(idx + placeholder.length)];
}

/** Pipe a React stream into the HTTP response, wrapping it with template head/tail. */
function pipeStreamResponse(
  res: ServerResponse,
  headPart: string,
  tailPart: string,
  pipe: (destination: Writable) => void,
): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.write(headPart);
  const sink = new Writable({
    write(chunk, _enc, cb) { res.write(chunk, cb); },
    final(cb) { res.end(tailPart, cb); },
  });
  pipe(sink);
}

// ── Static file serving ────────────────────────────────────────────────

/**
 * Try to serve a static file from `staticDir`.
 * Returns `true` if the file was served, `false` if it should fall through.
 */
async function serveStaticFile(
  staticDir: string,
  urlPath: string,
  res: ServerResponse,
): Promise<boolean> {
  // Decode and normalize, stripping traversal attempts
  const decoded = decodeURIComponent(urlPath);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(staticDir, safePath);

  // Path traversal protection
  if (!filePath.startsWith(staticDir)) return false;

  // Check cache first (LRU: delete + re-insert to move to end of iteration order)
  const cached = STATIC_CACHE.get(filePath);
  if (cached) {
    STATIC_CACHE.delete(filePath);
    STATIC_CACHE.set(filePath, cached);
    const headers: Record<string, string> = {
      'Content-Type': cached.mime,
      'Content-Length': String(cached.size),
    };
    if (IMMUTABLE_RE.test(filePath)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }
    res.writeHead(200, headers);
    res.end(cached.content);
    return true;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';

    const headers: Record<string, string> = {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
    };

    // Immutable cache for fingerprinted/hashed assets
    if (IMMUTABLE_RE.test(filePath)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }

    // Cache small files to avoid repeated fs.stat + fs.readFile
    if (stat.size <= MAX_CACHE_SIZE) {
      const content = await fs.readFile(filePath);
      STATIC_CACHE.set(filePath, { content, mime, size: stat.size });
      cacheSize += stat.size;
      evictIfNeeded();
      res.writeHead(200, headers);
      res.end(content);
      return true;
    }

    // Stream large files
    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

// ── Internal helpers ───────────────────────────────────────────────────

/** Returns true if the URL pathname has a file extension. */
function hasFileExtension(pathname: string): boolean {
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

/** Returns true if the URL starts with any of the given prefixes. */
function matchesApiPrefix(url: string, prefixes: string[]): boolean {
  return prefixes.some((p) => url.startsWith(p));
}

/** Normalize apiPrefix to a string array. */
function normalizePrefixes(apiPrefix: string | string[] | undefined): string[] {
  if (!apiPrefix) return ['/api'];
  return Array.isArray(apiPrefix) ? apiPrefix : [apiPrefix];
}

// ── SSR Server Factory ─────────────────────────────────────────────────

/**
 * Create a unified HTTP server that routes API requests through Hono
 * and everything else through the SSR / static pipeline.
 *
 * @param config      SSR configuration
 * @param honoHandler Node.js request listener from `getRequestListener(app.fetch)`
 * @param port        Port to listen on (default: 3000)
 * @returns The created server and resolved port
 */
export async function createSsrServer(
  config: SsrConfig,
  honoHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  port: number = 3000,
): Promise<{ server: Server; port: number }> {
  const isProd = process.env.NODE_ENV === 'production';
  const root = path.resolve(config.root);
  const apiPrefixes = normalizePrefixes(config.apiPrefix);
  const appPlaceholder = config.appPlaceholder ?? '<!--app-html-->';
  const headPlaceholder = config.headPlaceholder ?? '<!--ssr-head-->';

  if (isProd) {
    return startProductionServer(config, root, apiPrefixes, appPlaceholder, headPlaceholder, honoHandler, port);
  }
  return startDevServer(config, root, apiPrefixes, appPlaceholder, headPlaceholder, honoHandler, port);
}

// ════════════════════════════════════════════════════════════════════════
// Production SSR server
// ════════════════════════════════════════════════════════════════════════

async function startProductionServer(
  config: SsrConfig,
  root: string,
  apiPrefixes: string[],
  appPlaceholder: string,
  headPlaceholder: string,
  honoHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  port: number,
): Promise<{ server: Server; port: number }> {
  const distClient = path.resolve(root, config.distClient ?? 'dist/client');
  const distServer = path.resolve(root, config.distServer ?? 'dist/server');

  // Load template from the built client output
  const template = await fs.readFile(path.resolve(distClient, 'index.html'), 'utf-8');

  // Import the pre-built SSR render function
  const entryName = path.basename(config.entryServer).replace(/\.tsx?$/, '.js');
  const serverEntryPath = path.resolve(distServer, entryName);
  const { render } = (await import(pathToFileURL(serverEntryPath).href)) as {
    render: SsrRenderFn;
  };

  const server = createHttpServer(async (req, res) => {
    const url = req.url ?? '/';

    // API routes → Hono
    if (matchesApiPrefix(url, apiPrefixes)) {
      await honoHandler(req, res);
      return;
    }

    // Static files from dist/client/
    const pathname = url.split('?')[0];
    if (await serveStaticFile(distClient, pathname, res)) return;

    // SSR render
    try {
      const result = await render(url);

      if ('pipe' in result && typeof result.pipe === 'function') {
        // Streaming mode — split template and pipe
        let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
        if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
        pipeStreamResponse(res, headPart, tailPart, result.pipe);
      } else {
        // String mode — use splitAtPlaceholder to avoid double replace
        let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
        if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
        const html = headPart + (result as { html: string }).html + tailPart;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      }
    } catch (e) {
      console.error('[Kozo SSR] Render error:', e);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`🚀 Kozo SSR production server → http://localhost:${port}`);
      resolve({ server, port });
    });
  });
}

// ════════════════════════════════════════════════════════════════════════
// Development SSR server (Vite middleware integration)
// ════════════════════════════════════════════════════════════════════════

async function startDevServer(
  config: SsrConfig,
  root: string,
  apiPrefixes: string[],
  appPlaceholder: string,
  headPlaceholder: string,
  honoHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  port: number,
): Promise<{ server: Server; port: number }> {
  const templatePath = path.resolve(root, config.template ?? 'index.html');
  const entryServer = config.entryServer;

  // Auto-detect devSsr when not explicitly set:
  // If the HTML template contains the app placeholder (<!--app-html-->),
  // the project is wired for SSR (entry-server.tsx + hydrateRoot on the client).
  // Defaulting to false in that case causes a React hydration mismatch.
  // The only reason to keep false is @tailwindcss/vite v4 (CSS-in-JS FOUC),
  // which must now be opted-in explicitly with devSsr: false.
  let devSsr: boolean;
  if (config.devSsr !== undefined) {
    devSsr = config.devSsr;
  } else {
    let templateContent = '';
    try { templateContent = await fs.readFile(templatePath, 'utf-8'); } catch { /* not found yet */ }
    devSsr = templateContent.includes(appPlaceholder);
    if (devSsr) {
      console.log('[Kozo SSR] devSsr auto-enabled (index.html contains app placeholder). Set devSsr: false explicitly to use CSR mode.');
    }
  }

  const criticalCss = config.devCriticalCss ??
    'body{background:rgb(15 23 42);color:rgb(241 245 249)}#root{visibility:hidden}';

  // Dynamic import — resolve vite from the web app's root (not from @kozojs/core)
  // This ensures the consumer's installed Vite version and plugins are used.
  // We resolve the ESM entry explicitly to avoid Vite's CJS deprecation warning.
  let createViteServer: any;
  try {
    const localRequire = createRequire(path.resolve(root, 'package.json'));
    const viteDir = path.dirname(localRequire.resolve('vite/package.json'));
    const vitePkgRaw = await fs.readFile(path.join(viteDir, 'package.json'), 'utf-8');
    const vitePkg = JSON.parse(vitePkgRaw);
    // Prefer the ESM entry from package.json exports to avoid CJS deprecation
    const esmEntry: string =
      vitePkg.exports?.['.']?.import?.default ??
      vitePkg.exports?.['.']?.import ??
      vitePkg.module ??
      'dist/node/index.js';
    const vitePath = path.resolve(viteDir, esmEntry);
    const viteMod: any = await import(pathToFileURL(vitePath).href);
    createViteServer = viteMod.createServer ?? viteMod.default?.createServer;
  } catch {
    throw new Error(
      '[Kozo SSR] Vite is required for dev mode but not installed.\n' +
      `Run: pnpm add -D vite (in ${root})`,
    );
  }

  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  const server = createHttpServer(async (req, res) => {
    const url = req.url ?? '/';

    // API routes → Hono
    if (matchesApiPrefix(url, apiPrefixes)) {
      await honoHandler(req, res);
      return;
    }

    // Vite middleware (HMR WebSocket upgrade, module transforms, etc.)
    await new Promise<void>((resolve) => {
      vite.middlewares(req, res, resolve);
    });
    if (res.writableEnded) return;

    // Skip requests with file extensions (Chrome DevTools, .ico, etc.)
    const pathname = url.split('?')[0];
    if (hasFileExtension(pathname)) {
      res.writeHead(404);
      res.end();
      return;
    }

    try {
      let template = await fs.readFile(templatePath, 'utf-8');
      template = await vite.transformIndexHtml(url, template);

      if (devSsr) {
        // Full SSR in dev: load module via Vite and render
        const mod = await vite.ssrLoadModule(path.resolve(root, entryServer));
        const result: SsrRenderResult = await mod.render(url);

        if ('pipe' in result && typeof result.pipe === 'function') {
          let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
          if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
          pipeStreamResponse(res, headPart, tailPart, result.pipe);
          return; // streaming — response already started
        }

        if ('html' in result) {
          // Use splitAtPlaceholder to avoid double replace
          let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
          if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
          const html = headPart + result.html + tailPart;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
          return;
        }
      } else {
        // CSR in dev: inject critical CSS to prevent FOUC
        if (criticalCss) {
          template = template.replace('</head>', `<style>${criticalCss}</style></head>`);
        }
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      console.error('[Kozo SSR]', e);
      res.writeHead(500);
      res.end(String(e));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`⚡ Kozo SSR dev server → http://localhost:${port}`);
      resolve({ server, port });
    });
  });
}
