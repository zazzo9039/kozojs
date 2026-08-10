import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();
try { await app.nativeListen(config.port); } catch { await app.listen(config.port); }
console.log(`{{PROJECT_NAME}} listening on http://localhost:${config.port}`);
