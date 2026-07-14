import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const app = await buildApp();

console.log(`🔥 file-routing example → http://localhost:${PORT}`);
try {
  await app.nativeListen(PORT);
} catch {
  await app.listen(PORT);
}
