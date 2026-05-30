export interface ScaffoldOptions {
  projectName: string;
  runtime: 'node' | 'cloudflare' | 'bun';
  template: 'starter' | 'complete' | 'api-only';
  database: 'postgresql' | 'mysql' | 'sqlite' | 'none';
  dbPort?: number;
  auth: boolean;
  frontend: 'none' | 'react' | 'solid' | 'vue';
  /** Enable unified SSR (API + SSR in one server via listenSsr). Only when frontend !== 'none'. */
  ssr: boolean;
  extras: ('docker' | 'github-actions')[];
  packageSource: 'npm' | 'local';
}

