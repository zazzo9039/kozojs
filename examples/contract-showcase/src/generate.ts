import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContractShowcaseApp } from './app.js';

const directory = dirname(fileURLToPath(import.meta.url));
const output = resolve(directory, '../generated/api.ts');
const app = createContractShowcaseApp();
const source = app.generateClient({
  baseUrl: 'http://localhost:3000',
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, source, 'utf8');
console.log(`Generated ${output}`);
