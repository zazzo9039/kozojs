import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const app = await buildApp();

console.log(`🔥 file-routing example → http://localhost:${PORT}`);
await app.listen(PORT);
