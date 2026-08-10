import { createContractShowcaseApp } from './app.js';
import { config } from './config.js';

const app = createContractShowcaseApp();
const server = await app.listen(config.port);

console.log(`Kozo contract showcase listening on http://localhost:${server.port}`);
console.log(`OpenAPI UI: http://localhost:${server.port}/docs`);
