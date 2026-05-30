import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'templates');
const dest = path.join(root, 'packages', 'cli', 'templates');

if (!fs.existsSync(src)) {
  console.warn('copy-templates: no templates/ at repo root — skip');
  process.exit(0);
}

fs.cpSync(src, dest, { recursive: true, force: true });
console.log('copy-templates: synced → packages/cli/templates');
