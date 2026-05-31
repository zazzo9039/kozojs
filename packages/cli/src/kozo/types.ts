import fs from 'fs-extra';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  KOZO_CONFIG_CANDIDATES,
  KOZO_TYPES_CANDIDATES,
  KOZO_TYPES_OUTPUT,
  renderKozoTypesDts,
  type KozoAppDefinition,
  type KozoAppTypesRef,
} from '@kozojs/core';

export interface ResolvedKozoConfig {
  configPath: string;
  definition: KozoAppDefinition;
}

/** Find and import `kozo.config` default export from project root. */
export async function resolveKozoConfig(cwd = process.cwd()): Promise<ResolvedKozoConfig | null> {
  for (const rel of KOZO_CONFIG_CANDIDATES) {
    const configPath = path.join(cwd, rel);
    if (!(await fs.pathExists(configPath))) continue;

    const mod = await import(pathToFileURL(configPath).href);
    const definition = (mod.default ?? mod.kozoApp) as KozoAppDefinition | undefined;
    if (!definition?.types || typeof definition.build !== 'function') continue;

    return { configPath, definition };
  }
  return null;
}

/** Resolve types ref without bootstrapping the full app. */
async function resolveKozoTypesRef(cwd: string): Promise<KozoAppTypesRef | null> {
  for (const rel of KOZO_TYPES_CANDIDATES) {
    const full = path.join(cwd, rel);
    if (!(await fs.pathExists(full))) continue;
    const mod = await import(pathToFileURL(full).href);
    const ref = mod.kozoTypes ?? mod.default;
    if (ref?.from && ref?.name) return ref as KozoAppTypesRef;
  }

  const fromConfig = await resolveKozoConfig(cwd);
  return fromConfig?.definition.types ?? null;
}

/** Write `.kozo/types.d.ts` from kozo.config `types` field. */
export async function generateKozoTypes(cwd = process.cwd()): Promise<string | null> {
  const types = await resolveKozoTypesRef(cwd);
  if (!types) return null;

  const outPath = path.join(cwd, KOZO_TYPES_OUTPUT);
  await fs.ensureDir(path.dirname(outPath));
  const source = await renderKozoTypesDts(types, cwd);
  await fs.writeFile(outPath, source, 'utf8');
  return outPath;
}

/** Resolve buildApp from kozo.config or legacy src/app.ts. */
export async function resolveBuildApp(cwd = process.cwd()): Promise<(() => Promise<unknown>) | null> {
  const fromConfig = await resolveKozoConfig(cwd);
  if (fromConfig) return () => fromConfig.definition.build();

  const legacy = ['src/app.ts', 'src/app.js', 'src/index.ts', 'src/index.js'];
  for (const rel of legacy) {
    const full = path.join(cwd, rel);
    if (!(await fs.pathExists(full))) continue;
    const mod = await import(pathToFileURL(full).href);
    const buildApp = mod.buildApp ?? mod.default?.build ?? mod.default;
    if (typeof buildApp === 'function') return buildApp;
  }
  return null;
}
