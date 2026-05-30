export function generateSsrServer(): string {
  return `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 5173);

async function createServer() {
  const app = (await import('express')).default();

  let vite: Awaited<ReturnType<typeof createViteServer>> | null = null;

  if (!isProduction) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    const { default: sirv } = await import('sirv');
    app.use(sirv(path.join(__dirname, 'client'), { gzip: true }));
  }

  app.use('*', async (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) return next();
    try {
      const url = req.originalUrl;
      let template: string;
      let render: (url: string) => Promise<{ html: string; helmet?: { title?: string; description?: string } }>;

      if (!isProduction && vite) {
        template = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render;
      } else {
        template = fs.readFileSync(path.join(__dirname, 'client', 'index.html'), 'utf-8');
        render = (await import('./server/entry-server.js')).render;
      }

      const { html: appHtml, helmet = {} } = await render(url);
      const { title = 'App', description = '' } = helmet;

      const finalHtml = template
        .replace('<title>App</title>', \`<title>\${title}</title>\`)
        .replace('<!--description-->', description ? \`<meta name="description" content="\${description}" />\` : '')
        .replace('<!--app-html-->', appHtml);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(finalHtml);
    } catch (e) {
      vite?.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(PORT, () => {
    console.log(\`\${isProduction ? 'Production' : 'Dev'} server running at http://localhost:\${PORT}\`);
  });
}

createServer();
`;
}

export function generateIndexCss(_projectName?: string): string {
  return `@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --bg: #0f0f10;
  --bg-subtle: #1a1a1e;
  --card: #18181c;
  --card-border: #2a2a30;
  --sidebar-bg: #111114;
  --fg: #e8e8ec;
  --fg-muted: #888893;
  --fg-subtle: #555560;
  --border: #27272e;
  --input-bg: #1e1e22;
  --input-border: #32323a;
  --accent: #ABF43F;
  --accent-hover: #c0ff55;
  --accent-fg: #0a0f00;
  --accent-subtle: rgba(171,244,63,0.12);
  --accent-border: rgba(171,244,63,0.3);
  --destructive: #f87171;
  --radius: 0.75rem;
}

.light {
  --bg: #f8f8fa;
  --bg-subtle: #ededf0;
  --card: #ffffff;
  --card-border: #e0e0e6;
  --sidebar-bg: #f0f0f3;
  --fg: #121214;
  --fg-muted: #555560;
  --fg-subtle: #9999a8;
  --border: #e2e2e8;
  --input-bg: #ffffff;
  --input-border: #d0d0d8;
  --accent: #4d7c00;
  --accent-hover: #3d6300;
  --accent-fg: #ffffff;
  --accent-subtle: rgba(77,124,0,0.1);
  --accent-border: rgba(77,124,0,0.3);
  --destructive: #dc2626;
  --radius: 0.75rem;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  border-color: var(--border);
}

html {
  font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  font-size: 16px;
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  min-height: 100dvh;
}

#root {
  min-height: 100dvh;
}

.card {
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 1rem;
}

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--fg-subtle); }

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: calc(var(--radius) / 2);
}
`;
}

export function generateApiLib(auth: boolean): string {
  const tokenHelpers = auth ? `
const TOKEN_KEY = 'token';
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => { localStorage.setItem(TOKEN_KEY, t); };
export const clearToken = (): void => { localStorage.removeItem(TOKEN_KEY); };
` : '';

  return `export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NO_BODY = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);
${tokenHelpers}
export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  ok: boolean;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (!NO_BODY.has((options.method ?? 'GET').toUpperCase())) {
    headers['Content-Type'] ??= 'application/json';
  }
${auth ? `
  const token = getToken();
  if (token) headers['Authorization'] = \`Bearer \${token}\`;
` : ''}
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:401'));
  }

  let data: T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    data = await res.json() as T;
  } else {
    data = (await res.text()) as unknown as T;
  }

  if (!res.ok) {
    throw new ApiError(res.status, \`HTTP \${res.status}\`, data);
  }

  return { data, status: res.status, ok: res.ok };
}
`;
}

export function generateQueriesLib(): string {
  return `import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface User {
  id: string | number;
  name: string;
  email: string;
  role?: 'admin' | 'user' | string;
  createdAt?: string;
}

export interface Post {
  id: string | number;
  title: string;
  content?: string;
  published?: boolean;
  authorId?: string | number;
  createdAt?: string;
}

export interface Task {
  id: string | number;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt?: string;
}

export interface Stats {
  users: number;
  posts: number;
  tasks: number;
  completedTasks: number;
}

async function fetchList<T>(url: string): Promise<T[]> {
  const res = await apiFetch<T[] | { data: T[]; items: T[] }>(url);
  if (Array.isArray(res.data)) return res.data;
  return (res.data as { data?: T[]; items?: T[] }).data
    ?? (res.data as { data?: T[]; items?: T[] }).items
    ?? [];
}

export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: async () => {
    const res = await apiFetch<{ status: string; uptime?: number }>('/api/health');
    return res.data;
  },
  staleTime: 30_000,
});

export const statsQuery = queryOptions({
  queryKey: ['stats'],
  queryFn: async () => {
    const res = await apiFetch<Stats>('/api/stats');
    return res.data;
  },
});

export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: () => fetchList<User>('/api/users'),
});

export const postsQuery = queryOptions({
  queryKey: ['posts'],
  queryFn: () => fetchList<Post>('/api/posts'),
});

export const tasksQuery = queryOptions({
  queryKey: ['tasks'],
  queryFn: () => fetchList<Task>('/api/tasks'),
});
`;
}

export function generateSkeletonComponent(): string {
  return `import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md', className)}
      style={{ background: 'var(--bg-subtle)' }}
    />
  );
}
`;
}

export function generateEntryClient(projectName: string, auth: boolean): string {
  return `import React from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/queryClient';
import App from './App';
import './index.css';

function revealRoot() {
  const el = document.getElementById('root');
  if (el) el.style.visibility = 'visible';
}

// Apply saved theme before first paint to avoid flash
const savedTheme = localStorage.getItem('theme-storage');
try {
  const { state } = JSON.parse(savedTheme ?? '{}') as { state?: { theme?: string } };
  if (state?.theme === 'light') {
    document.documentElement.classList.add('light');
  }
} catch { /* ignore */ }

const queryClient = createQueryClient();
const rootEl = document.getElementById('root')!;

if (rootEl.childNodes.length > 0) {
  hydrateRoot(rootEl, <React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
} else {
  createRoot(rootEl).render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
}

revealRoot();
`;
}

export function generateSpaEntryClient(projectName: string, auth: boolean): string {
  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/queryClient';
import App from './App';
import './index.css';

// Apply saved theme before first paint to avoid flash
const savedTheme = localStorage.getItem('theme-storage');
try {
  const { state } = JSON.parse(savedTheme ?? '{}') as { state?: { theme?: string } };
  if (state?.theme === 'light') {
    document.documentElement.classList.add('light');
  }
} catch { /* ignore */ }

const queryClient = createQueryClient();
const rootEl = document.getElementById('root')!;

createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

rootEl.style.visibility = 'visible';
`;
}

export function generateEntryServer(projectName: string): string {
  return `import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export interface PageMeta {
  title: string;
  description: string;
}

const PAGE_META: Record<string, PageMeta> = {
  '/':       { title: '${projectName}',         description: 'Dashboard' },
  '/users':  { title: '${projectName} — Users',  description: 'Manage users' },
  '/posts':  { title: '${projectName} — Posts',  description: 'Manage posts' },
  '/tasks':  { title: '${projectName} — Tasks',  description: 'Manage tasks' },
};

export async function render(url: string): Promise<{ html: string; helmet: PageMeta }> {
  const html = renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  const meta = PAGE_META[url] ?? PAGE_META['/'];
  return { html, helmet: meta };
}
`;
}

export function generateAppTest(): string {
  return `import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../App';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />, { wrapper });
    expect(document.body).toBeDefined();
  });
});
`;
}
