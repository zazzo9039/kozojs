import { createContractShowcaseApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const app = createContractShowcaseApp();
const server = await app.listen(port);

console.log(`Kozo contract showcase listening on http://localhost:${server.port}`);
console.log(`OpenAPI UI: http://localhost:${server.port}/docs`);
