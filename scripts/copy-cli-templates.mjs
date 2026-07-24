/**
 * Sync the starter templates into the CLI package.
 *
 * `templates/` at the repo root is the single source of truth. `packages/cli/templates/`
 * is derived from it and committed only because it is what npm publishes — editing
 * it directly is a mistake, and one that used to be silent: this script would
 * overwrite the edit on the next build and the fix would vanish. That is how the
 * hardcoded JWT secret (F-01) survived in three places at once.
 *
 * Usage:
 *   node scripts/copy-cli-templates.mjs           sync templates/ -> packages/cli/templates/
 *   node scripts/copy-cli-templates.mjs --check   verify they match; exit 1 if not
 *
 * `--check` must run BEFORE the build in CI. The build calls this script in sync
 * mode, so by the time tests run any drift has already been repaired.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'templates');
const dest = path.join(root, 'packages', 'cli', 'templates');
const check = process.argv.includes('--check');

if (!fs.existsSync(src)) {
  console.warn('copy-templates: no templates/ at repo root — skip');
  process.exit(0);
}

if (!check) {
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log('copy-templates: synced → packages/cli/templates');
  process.exit(0);
}

/** Relative paths of every file under `dir`, sorted, with `/` separators. */
function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.turbo' || entry.name === 'dist') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

if (!fs.existsSync(dest)) {
  console.error('copy-templates: packages/cli/templates is missing — run without --check to create it');
  process.exit(1);
}

const sourceFiles = listFiles(src);
const destFiles = listFiles(dest);
const problems = [];

for (const rel of sourceFiles) {
  if (!destFiles.includes(rel)) {
    problems.push(`missing from packages/cli/templates: ${rel}`);
    continue;
  }
  const a = fs.readFileSync(path.join(src, rel));
  const b = fs.readFileSync(path.join(dest, rel));
  if (!a.equals(b)) problems.push(`differs: ${rel}`);
}
for (const rel of destFiles) {
  if (!sourceFiles.includes(rel)) problems.push(`not in templates/, delete it: ${rel}`);
}

if (problems.length > 0) {
  console.error('copy-templates: packages/cli/templates has drifted from templates/');
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  console.error('  templates/ is the source of truth. Make the change there, then run:');
  console.error('    node scripts/copy-cli-templates.mjs');
  console.error('  and commit both trees.');
  process.exit(1);
}

console.log(`copy-templates: in sync (${sourceFiles.length} files)`);
