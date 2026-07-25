import fs from 'fs-extra';
import path from 'node:path';

export const TEMPLATE_NAMES = ['minimal', 'file-routing', 'fullstack-ssr'] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export function isTemplateName(value: string): value is TemplateName {
  return (TEMPLATE_NAMES as readonly string[]).includes(value);
}

/** Directory containing this module (CJS lib/ or ESM src/). */
function moduleDir(): string {
  if (typeof __dirname !== 'undefined') return __dirname;
  // Source-mode fallback for ESM test/dev runners. Published CLI builds are CJS
  // and always use __dirname above.
  return process.cwd();
}

/** Locate repo-root or package-bundled `templates/`. */
export function resolveTemplatesRoot(): string {
  const here = moduleDir();
  const candidates = [
    path.resolve(here, '../templates'),
    path.resolve(here, '../../../../templates'),
    path.resolve(here, '../../../templates'),
    path.resolve(here, '../../templates'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'minimal', 'package.json'))) {
      return candidate;
    }
  }

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'templates');
    if (fs.existsSync(path.join(candidate, 'minimal', 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    'Could not find Kozo templates directory.\n' +
    'Run from the kozo monorepo or install a CLI version that bundles templates/.',
  );
}

/**
 * Read the version of the running CLI package.
 *
 * In the monorepo, templates live at `<root>/templates`; in the npm package,
 * they live beside `package.json`. Supporting both layouts keeps the version
 * source centralized in `packages/cli/package.json`.
 */
export function resolveCliPackageVersion(): string {
  const templatesRoot = resolveTemplatesRoot();
  const packageRoot = path.dirname(templatesRoot);
  const candidates = [
    path.join(packageRoot, 'package.json'),
    path.join(packageRoot, 'packages', 'cli', 'package.json'),
  ];

  for (const manifestPath of candidates) {
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = fs.readJSONSync(manifestPath) as { name?: string; version?: string };
    if (manifest.name === '@kozojs/cli' && manifest.version) {
      return manifest.version;
    }
  }

  throw new Error('Could not resolve the @kozojs/cli package version.');
}

export function kozoDependencyRange(): string {
  return `^${resolveCliPackageVersion()}`;
}

async function replaceInTree(dir: string, search: string, replace: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await replaceInTree(full, search, replace);
      continue;
    }
    if (!/\.(ts|tsx|json|md|html|example|env)$/i.test(entry.name) && entry.name !== '.env.example') {
      continue;
    }
    const text = await fs.readFile(full, 'utf8');
    if (text.includes(search)) {
      await fs.writeFile(full, text.split(search).join(replace), 'utf8');
    }
  }
}

/** Copy a starter template into `dest`, replacing {{PROJECT_NAME}} placeholders. */
export async function copyTemplate(
  template: TemplateName,
  dest: string,
  projectName: string,
): Promise<void> {
  if (!isTemplateName(template)) {
    throw new Error(`Unknown template "${template}". Choose: ${TEMPLATE_NAMES.join(', ')}`);
  }

  const src = path.join(resolveTemplatesRoot(), template);
  if (!fs.existsSync(src)) {
    throw new Error(`Template not found: ${src}`);
  }

  if (await fs.pathExists(dest)) {
    throw new Error(`Destination already exists: ${dest}`);
  }

  // Filter on the path relative to the template root: the absolute src path
  // legitimately contains node_modules when the CLI is installed as a package
  // (npx cache, local or global node_modules), and a filter that rejects the
  // copy root makes fs.copy silently copy nothing.
  await fs.copy(src, dest, {
    filter: (p) => !path.relative(src, p).split(path.sep).includes('node_modules'),
  });
  await replaceInTree(dest, '{{PROJECT_NAME}}', projectName);
}
