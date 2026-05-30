import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKozo, z } from '@kozojs/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../web');

const app = createKozo({ routesDir: path.join(__dirname, 'routes') });

app.get('/api/health', (ctx) => ctx.json({ ok: true }));

app.get('/api/hello', {
  query: z.object({ name: z.string().optional() }),
  response: z.object({ message: z.string() }),
}, (ctx) => ({ message: `Hello, ${ctx.query.name ?? 'world'}!` }));

await app.loadRoutes();

const PORT = Number(process.env.PORT) || 3000;
await app.listenSsr(PORT, {
  root: webRoot,
  entryServer: 'src/entry-server.tsx',
  apiPrefix: '/api',
});

console.log(`🚀 {{PROJECT_NAME}} (API + SSR) → http://localhost:${PORT}`);
