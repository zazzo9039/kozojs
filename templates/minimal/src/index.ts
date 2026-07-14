import { createKozo, z } from '@kozojs/core';

const app = createKozo();

app.get('/health', (ctx) => ctx.json({ ok: true, uptime: process.uptime() }));

app.get('/hello/:name', {
  params: z.object({ name: z.string().min(1) }),
  response: z.object({ message: z.string() }),
}, (ctx) => ({ message: `Hello, ${ctx.params.name}!` }));

const PORT = Number(process.env.PORT) || 3000;
try {
  await app.nativeListen(PORT);
} catch {
  await app.listen(PORT);
}
console.log(`🚀 {{PROJECT_NAME}} → http://localhost:${PORT}`);
