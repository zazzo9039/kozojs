import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
const mojibake = /Ã|Â|â€|â†|ðŸ|�/u;
const placeholder = /\{\{([A-Z_]+)\}\}/g;
const allowed = new Set(['PROJECT_NAME']);
const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else {
      const content = fs.readFileSync(file, 'utf8');
      if (mojibake.test(content)) failures.push(`${path.relative(root, file)}: mojibake`);
      for (const match of content.matchAll(placeholder)) {
        if (!allowed.has(match[1])) failures.push(`${path.relative(root, file)}: unknown placeholder ${match[0]}`);
      }
    }
  }
}

walk(root);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('template quality: no mojibake or unknown placeholders');
