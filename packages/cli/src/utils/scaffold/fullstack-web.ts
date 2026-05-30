import fs from 'fs-extra';
import path from 'node:path';
import { generateAppTsx, generateLoginPage, generateDashboardPage,
         generateUsersPage, generatePostsPage, generateTasksPage } from './generators/pages.js';
import { generateSsrServer, generateIndexCss, generateApiLib, generateQueriesLib,
         generateSkeletonComponent, generateEntryClient, generateSpaEntryClient, generateEntryServer,
         generateAppTest } from './generators/assets.js';

export async function scaffoldFullstackWeb(
  projectDir: string,
  projectName: string,
  frontend: 'react' | 'solid' | 'vue',
  auth: boolean = false,
  ssr: boolean = false,
): Promise<void> {
  const webDir = path.join(projectDir, 'apps', 'web');

  // Create directory structure mirroring kozo-app
  await fs.ensureDir(path.join(webDir, 'src', 'lib'));
  await fs.ensureDir(path.join(webDir, 'src', 'pages'));
  await fs.ensureDir(path.join(webDir, 'src', 'store'));
  await fs.ensureDir(path.join(webDir, 'src', 'components'));
  await fs.ensureDir(path.join(webDir, 'src', 'hooks'));
  await fs.ensureDir(path.join(webDir, 'src', '__tests__'));

  // ── package.json ──────────────────────────────────────────────────────────
  const packageJson = {
    name: `@${projectName}/web`,
    version: '1.0.0',
    type: 'module',
    scripts: ssr
      ? {
          build: 'vite build && vite build --ssr src/entry-server.tsx --outDir dist/server',
          preview: 'cross-env NODE_ENV=production tsx server.ts',
          test: 'vitest run',
          'test:watch': 'vitest',
          'type-check': 'tsc --noEmit',
        }
      : {
          dev: 'vite',
          build: 'vite build',
          test: 'vitest run',
          'test:watch': 'vitest',
          'type-check': 'tsc --noEmit',
        },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      '@tanstack/react-query': '^5.0.0',
      'lucide-react': '^0.460.0',
      sonner: '^2.0.7',
      zustand: '^5.0.11',
      clsx: '^2.1.1',
      'tailwind-merge': '^3.5.0',
      zod: '^4.0.0',
      ...(auth && { 'react-hook-form': '^7.71.2', '@hookform/resolvers': '^5.2.2' }),
    },
    devDependencies: {
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      '@vitejs/plugin-react': '^4.7.0',
      '@tailwindcss/vite': '^4.0.0',
      tailwindcss: '^4.0.0',
      'tw-animate-css': '^1.4.0',
      typescript: '^5.6.0',
      vite: '^5.0.0',
      tsx: '^4.21.0',
      'cross-env': '^7.0.3',
      vitest: '^4.0.18',
      jsdom: '^28.1.0',
      '@testing-library/react': '^16.3.2',
      '@testing-library/jest-dom': '^6.9.1',
      '@testing-library/user-event': '^14.6.1',
    },
  };
  await fs.writeJSON(path.join(webDir, 'package.json'), packageJson, { spaces: 2 });

  // ── tsconfig.json ─────────────────────────────────────────────────────────
  await fs.writeJSON(path.join(webDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      paths: { '@/*': ['./src/*'] },
    },
    include: ['src'],
  }, { spaces: 2 });

  // ── vite.config.ts ────────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'vite.config.ts'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
`);

  // ── index.html ────────────────────────────────────────────────────────────
  // Root is hidden initially to eliminate FOUC; entry-client.tsx reveals it.
  const rootContent = ssr ? '<!--app-html-->' : '';
  await fs.writeFile(path.join(webDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName}</title>
</head>
<body>
  <div id="root" style="visibility:hidden">${rootContent}</div>
  <script type="module" src="/src/entry-client.tsx"></script>
</body>
</html>
`);

  // ── components.json (shadcn/ui config) ────────────────────────────────────
  await fs.writeJSON(path.join(webDir, 'components.json'), {
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'new-york',
    rsc: false,
    tsx: true,
    tailwind: {
      config: '',
      css: 'src/index.css',
      baseColor: 'neutral',
      cssVariables: true,
      prefix: '',
    },
    iconLibrary: 'lucide',
    rtl: false,
    aliases: {
      components: '@/components',
      utils: '@/lib/utils',
      ui: '@/components/ui',
      lib: '@/lib',
      hooks: '@/hooks',
    },
    registries: {},
  }, { spaces: 2 });

  // ── vitest.config.ts ──────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'vitest.config.ts'), `import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`);

  // ── vitest.setup.ts ───────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'vitest.setup.ts'), `import '@testing-library/jest-dom/vitest';
`);

  // ── server.ts (SSR dev + production server) ───────────────────────────────
  if (ssr) {
    await fs.writeFile(path.join(webDir, 'server.ts'), generateSsrServer());
  }

  // ── src/index.css (design system with light/dark CSS vars) ───────────────
  await fs.writeFile(path.join(webDir, 'src', 'index.css'), generateIndexCss(projectName));

  // ── src/lib/api.ts ────────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'lib', 'api.ts'), generateApiLib(auth));

  // ── src/lib/utils.ts ──────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'lib', 'utils.ts'), `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`);

  // ── src/lib/queryClient.ts ────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'lib', 'queryClient.ts'), `import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api.js';

/** Never retry on auth errors — user must re-authenticate. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
  return failureCount < 1;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: shouldRetry },
    },
  });
}
`);

  // ── src/lib/queries.ts (central query registry) ───────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'lib', 'queries.ts'), generateQueriesLib());

  // ── src/store/ui.ts ───────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'store', 'ui.ts'), `import { create } from 'zustand';
import { toast } from 'sonner';

interface UIState {
  globalLoading: boolean;
  setGlobalLoading: (v: boolean) => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>(() => ({
  globalLoading: false,
  setGlobalLoading: (v) => useUIStore.setState({ globalLoading: v }),
  notify: (type, message) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast.info(message);
  },
  sidebarOpen: false,
  toggleSidebar: () => useUIStore.setState((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (v) => useUIStore.setState({ sidebarOpen: v }),
}));
`);

  // ── src/store/theme.ts ────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'store', 'theme.ts'), `import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

/** Persisted theme store — applies .dark class to <html> for Tailwind v4. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => { applyThemeClass(theme); set({ theme }); },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        applyThemeClass(next);
        set({ theme: next });
      },
    }),
    {
      name: '${projectName}_theme',
      onRehydrateStorage: () => (state) => { if (state) applyThemeClass(state.theme); },
    },
  ),
);

function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
}
`);

  // ── src/components/Skeleton.tsx ───────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'components', 'Skeleton.tsx'), generateSkeletonComponent());

  // ── src/components/PreloadSpinner.tsx ─────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'components', 'PreloadSpinner.tsx'), `import { useUIStore } from '@/store/ui';

/** Full-viewport spinner overlay shown while globalLoading is true. */
export default function PreloadSpinner() {
  const loading = useUIStore((s) => s.globalLoading);
  if (!loading) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '12px',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}>
        <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
        <path d="M20 4 A16 16 0 0 1 36 20" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        <style>{\`@keyframes spin { to { transform: rotate(360deg); } }\`}</style>
      </svg>
      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.02em' }}>
        Loading…
      </span>
    </div>
  );
}
`);

  // ── src/entry-client.tsx (SSR-aware hydration or SPA mount) ─────────────
  await fs.writeFile(path.join(webDir, 'src', 'entry-client.tsx'), ssr
    ? generateEntryClient(projectName, auth)
    : generateSpaEntryClient(projectName, auth));

  // ── src/entry-server.tsx (SSR rendering) ──────────────────────────────────
  if (ssr) {
    await fs.writeFile(path.join(webDir, 'src', 'entry-server.tsx'), generateEntryServer(projectName));
  }

  // ── src/main.tsx (legacy SPA fallback) ───────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'main.tsx'), `import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { createQueryClient } from './lib/queryClient';
import './index.css';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
`);

  // ── src/__tests__/App.test.tsx ────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', '__tests__', 'App.test.tsx'), generateAppTest());

  // ── Pages ─────────────────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'pages', 'Dashboard.tsx'), generateDashboardPage());
  await fs.writeFile(path.join(webDir, 'src', 'pages', 'Users.tsx'), generateUsersPage());
  await fs.writeFile(path.join(webDir, 'src', 'pages', 'Posts.tsx'), generatePostsPage());
  await fs.writeFile(path.join(webDir, 'src', 'pages', 'Tasks.tsx'), generateTasksPage());
  if (auth) {
    await fs.writeFile(path.join(webDir, 'src', 'pages', 'Login.tsx'), generateLoginPage());
  }

  // ── src/App.tsx ───────────────────────────────────────────────────────────
  await fs.writeFile(path.join(webDir, 'src', 'App.tsx'), generateAppTsx(projectName, auth));
}

// ============================================
// REACT PAGES
// ============================================


export async function scaffoldFullstackReadme(projectDir: string, projectName: string): Promise<void> {
  const readme = `# ${projectName}

Full-stack application built with **[Kozo](https://github.com/kozojs/kozo)** — React + Vite frontend with SSR support and a Kozo/Hono API backend.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite 5, TailwindCSS v4, TanStack Query v5 |
| State | Zustand (UI store + persisted theme) |
| Toasts | Sonner |
| Icons | Lucide React |
| Backend | Kozo (Hono-based), TypeScript, Zod |
| Build | tsup, pnpm workspaces |

## Project Structure

\`\`\`
apps/
├── api/                       # Backend
│   └── src/
│       ├── routes/            # File-system routes
│       │   ├── api/health.ts
│       │   ├── api/users/
│       │   ├── api/posts/
│       │   └── api/tasks/
│       └── index.ts
└── web/                       # Frontend
    ├── server.ts              # SSR dev/prod server
    └── src/
        ├── App.tsx            # Router + layout
        ├── entry-client.tsx   # SSR-aware hydration
        ├── entry-server.tsx   # renderToString
        ├── index.css          # Design system (CSS vars)
        ├── lib/
        │   ├── api.ts         # apiFetch + ApiError
        │   ├── queries.ts     # TanStack Query registry
        │   ├── queryClient.ts
        │   └── utils.ts       # cn() utility
        ├── store/
        │   ├── ui.ts          # Sidebar + notify + loading
        │   └── theme.ts       # Persisted dark/light
        ├── components/
        │   ├── Skeleton.tsx
        │   └── PreloadSpinner.tsx
        └── pages/
            ├── DashboardPage.tsx
            ├── UsersPage.tsx
            ├── PostsPage.tsx
            └── TasksPage.tsx
\`\`\`

## Getting Started

\`\`\`bash
pnpm install
pnpm dev            # starts both API (3000) and web (5173)
\`\`\`

## Environment Variables

\`\`\`
# apps/api/.env
PORT=3000
DATABASE_URL=postgresql://...   # if using DB

# apps/web/.env
VITE_API_URL=http://localhost:3000
\`\`\`

## API Endpoints

### Health
- \`GET /api/health\` — health check
- \`GET /api/stats\`  — aggregate statistics

### Users
- \`GET /api/users\`        — list
- \`POST /api/users\`       — create \`{ name, email }\`
- \`DELETE /api/users/:id\` — delete

### Posts
- \`GET /api/posts\`        — list (query: \`?published=true\`)
- \`POST /api/posts\`       — create \`{ title, content?, published? }\`
- \`DELETE /api/posts/:id\` — delete

### Tasks
- \`GET /api/tasks\`           — list (query: \`?completed=true\`)
- \`POST /api/tasks\`          — create \`{ title, priority? }\`
- \`PATCH /api/tasks/:id/toggle\` — toggle completion
- \`DELETE /api/tasks/:id\`    — delete

## Design System

The app uses CSS custom properties for theming (dark by default, light class-based):

| Variable | Purpose |
|----------|---------|
| \`--bg\`, \`--bg-subtle\` | backgrounds |
| \`--card\`, \`--card-border\` | card surfaces |
| \`--fg\`, \`--fg-muted\` | text |
| \`--accent\` (#ABF43F / #4d7c00) | primary CTA |
| \`--destructive\` | delete/error |

## Build

\`\`\`bash
pnpm build          # build all packages
pnpm preview        # preview SSR production build
pnpm test           # run vitest
\`\`\`
`;

  await fs.writeFile(path.join(projectDir, 'README.md'), readme);
}

