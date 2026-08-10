import fs from 'fs-extra';
import path from 'node:path';

export interface FeatureGeneratorOptions {
  crud?: boolean;
  repository?: boolean;
  auth?: boolean;
  dryRun?: boolean;
  force?: boolean;
  barrel?: boolean;
  cwd?: string;
}

export interface GeneratedFeatureFile {
  path: string;
  content: string;
}

export function validateFeatureName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error('Feature name must be kebab-case and start with a letter.');
  }
  return normalized;
}

function pascal(name: string): string {
  return name.split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join('');
}

function camel(name: string): string {
  const value = pascal(name);
  return value[0]!.toLowerCase() + value.slice(1);
}

function contractTemplate(name: string, typeName: string, options: FeatureGeneratorOptions): string {
  const auth = options.auth
    ? `\nexport const ${typeName}AuthorizationHeadersSchema = z.object({\n  authorization: z.string().startsWith('Bearer '),\n});\n`
    : '';
  const crud = options.crud
    ? `\nexport const Update${typeName}Schema = Create${typeName}Schema.partial().refine(\n  (input) => Object.keys(input).length > 0,\n  'At least one field is required',\n);\n`
    : '';
  return `import { z } from '@kozojs/core';

export const ${typeName}ProblemSchema = z.object({
  type: z.string(), title: z.string(), status: z.number().int(), detail: z.string(),
});
export const ${typeName}Schema = z.object({ id: z.string(), name: z.string() });
export const Create${typeName}Schema = z.object({ name: z.string().min(1) });
export const ${typeName}IdParamsSchema = z.object({ id: z.string().min(1) });
export const ${typeName}ListSchema = z.object({ items: z.array(${typeName}Schema) });
${auth}${crud}
export const ${typeName}Responses = {
  list: { 200: ${typeName}ListSchema },
  created: { 201: ${typeName}Schema },
  detail: { 200: ${typeName}Schema, 404: ${typeName}ProblemSchema },${options.crud ? `
  updated: { 200: ${typeName}Schema, 404: ${typeName}ProblemSchema },
  deleted: { 204: z.undefined(), 404: ${typeName}ProblemSchema },` : ''}
} as const;
`;
}

function repositoryTemplate(typeName: string): string {
  return `import type { Infer } from '@kozojs/core';
import type { ${typeName}Schema } from './${typeName.toLowerCase()}.contract.js';

export type ${typeName} = Infer<typeof ${typeName}Schema>;

export interface ${typeName}Repository {
  list(): ${typeName}[];
  find(id: string): ${typeName} | undefined;
  save(value: ${typeName}): ${typeName};
  delete(id: string): boolean;
}

export function createMemory${typeName}Repository(): ${typeName}Repository {
  const values = new Map<string, ${typeName}>();
  return {
    list: () => [...values.values()],
    find: (id) => values.get(id),
    save(value) { values.set(value.id, value); return value; },
    delete: (id) => values.delete(id),
  };
}
`;
}

function serviceTemplate(name: string, key: string, typeName: string, options: FeatureGeneratorOptions): string {
  const repoImport = options.repository
    ? `import type { ${typeName}Repository } from './${name}.repository.js';\n`
    : '';
  const state = options.repository ? '' : `  const values = new Map<string, ${typeName}>();\n`;
  const source = options.repository ? 'repository' : 'values';
  const signature = options.repository ? `repository: ${typeName}Repository` : '';
  const update = options.crud ? `
    update(id, input) {
      const current = ${source}.${options.repository ? 'find' : 'get'}(id);
      if (!current) return undefined;
      const updated = { ...current, ...input };
      ${options.repository ? 'repository.save(updated);' : 'values.set(id, updated);'}
      return updated;
    },
    delete: (id) => ${source}.delete(id),` : '';
  return `import type { Infer } from '@kozojs/core';
import type { Create${typeName}Schema, ${typeName}Schema${options.crud ? `, Update${typeName}Schema` : ''} } from './${name}.contract.js';
${repoImport}
type ${typeName} = Infer<typeof ${typeName}Schema>;
type Create${typeName} = Infer<typeof Create${typeName}Schema>;${options.crud ? `
type Update${typeName} = Infer<typeof Update${typeName}Schema>;` : ''}

export interface ${typeName}Service {
  list(): ${typeName}[];
  find(id: string): ${typeName} | undefined;
  create(input: Create${typeName}): ${typeName};${options.crud ? `
  update(id: string, input: Update${typeName}): ${typeName} | undefined;
  delete(id: string): boolean;` : ''}
}

export function create${typeName}Service(${signature}): ${typeName}Service {
${state}  let nextId = 1;
  return {
    list: () => ${options.repository ? 'repository.list()' : '[...values.values()]'},
    find: (id) => ${source}.${options.repository ? 'find' : 'get'}(id),
    create(input) {
      const value = { id: '${name}-' + nextId++, ...input };
      ${options.repository ? 'return repository.save(value);' : 'values.set(value.id, value); return value;'}
    },${update}
  };
}
`;
}

function routesTemplate(name: string, key: string, typeName: string, options: FeatureGeneratorOptions): string {
  const authImport = options.auth ? `, ${typeName}AuthorizationHeadersSchema` : '';
  const headers = options.auth ? ` headers: ${typeName}AuthorizationHeadersSchema,` : '';
  const crudImport = options.crud ? `, Update${typeName}Schema` : '';
  const crud = options.crud ? `
  .patch('/:id', { params: ${typeName}IdParamsSchema, body: Update${typeName}Schema,${headers} response: ${typeName}Responses.updated },
    ({ params, body, services, json }) => {
      const value = services.${key}.update(params.id, body);
      return value ? json(value, 200) : json(problem(404, '${typeName} not found'), 404);
    })
  .delete('/:id', { params: ${typeName}IdParamsSchema,${headers} response: ${typeName}Responses.deleted },
    ({ params, services, json }) => services.${key}.delete(params.id)
      ? json(undefined, 204)
      : json(problem(404, '${typeName} not found'), 404))` : '';
  return `import { createRouter } from '@kozojs/core';
import type { AppServices } from '../../services.js';
import { Create${typeName}Schema, ${typeName}IdParamsSchema, ${typeName}Responses${authImport}${crudImport} } from './${name}.contract.js';

const problem = (status: number, detail: string) => ({
  type: 'about:blank', title: status === 404 ? 'Not Found' : 'Error', status, detail,
});

export const ${key}Routes = createRouter<AppServices>()
  .get('/', {${headers} response: ${typeName}Responses.list },
    ({ services, json }) => json({ items: services.${key}.list() }, 200))
  .post('/', { body: Create${typeName}Schema,${headers} response: ${typeName}Responses.created },
    ({ body, services, json }) => json(services.${key}.create(body), 201))
  .get('/:id', { params: ${typeName}IdParamsSchema,${headers} response: ${typeName}Responses.detail },
    ({ params, services, json }) => {
      const value = services.${key}.find(params.id);
      return value ? json(value, 200) : json(problem(404, '${typeName} not found'), 404);
    })${crud};
`;
}

function testTemplate(name: string, key: string, typeName: string, options: FeatureGeneratorOptions): string {
  const headers = options.auth ? `, headers: { authorization: 'Bearer test-token' }` : '';
  const rawOptions = options.auth ? `, { headers: { authorization: 'Bearer test-token' } }` : '';
  const crud = options.crud ? `
    const updated = await client.${key}.$id.patch({
      params: { id: created.json().id }, body: { name: 'Updated' }${headers},
    });
    expect(updated.status).toBe(200);
    const deleted = await client.${key}.$id.delete({ params: { id: created.json().id }${headers} });
    expect(deleted.status).toBe(204);` : '';
  return `import { describe, expect, it } from 'vitest';
import { createContractTestClient, createTestClient } from '@kozojs/testing';
import { createApp } from '../../app.js';

describe('${name} feature', () => {
  it('creates and reads a ${name}', async () => {
    const client = createContractTestClient(createApp());
    const created = await client.${key}.post({ body: { name: 'Example' }${headers} });
    expect(created.status).toBe(201);
    const detail = await client.${key}.$id.get({ params: { id: created.json().id }${headers} });
    expect(detail.status).toBe(200);
${crud}
  });

  it('rejects malformed raw input', async () => {
    const response = await createTestClient(createApp()).post('/${name}', { name: '' }${rawOptions});
    expect(response.status).toBe(400);
  });
});
`;
}

export function generateFeatureFiles(rawName: string, options: FeatureGeneratorOptions = {}): GeneratedFeatureFile[] {
  const name = validateFeatureName(rawName);
  const typeName = pascal(name);
  const key = camel(name);
  const base = path.posix.join('src', 'modules', name);
  const files: GeneratedFeatureFile[] = [
    { path: `${base}/${name}.contract.ts`, content: contractTemplate(name, typeName, options) },
    { path: `${base}/${name}.service.ts`, content: serviceTemplate(name, key, typeName, options) },
    { path: `${base}/${name}.routes.ts`, content: routesTemplate(name, key, typeName, options) },
    { path: `${base}/${name}.test.ts`, content: testTemplate(name, key, typeName, options) },
    { path: `${base}/index.ts`, content: `export { ${key}Routes } from './${name}.routes.js';\nexport { create${typeName}Service, type ${typeName}Service } from './${name}.service.js';\n` },
  ];
  if (options.repository) {
    files.splice(2, 0, { path: `${base}/${name}.repository.ts`, content: repositoryTemplate(typeName).replaceAll(typeName.toLowerCase(), name) });
    const barrel = files.find((file) => file.path.endsWith('/index.ts'))!;
    barrel.content += `export { createMemory${typeName}Repository, type ${typeName}Repository } from './${name}.repository.js';\n`;
  }
  return files;
}

export async function writeFeatureFiles(rawName: string, options: FeatureGeneratorOptions = {}): Promise<GeneratedFeatureFile[]> {
  const root = options.cwd ?? process.cwd();
  const files = generateFeatureFiles(rawName, options);
  if (options.dryRun) return files;
  if (!options.force) {
    const conflicts = [];
    for (const file of files) {
      if (await fs.pathExists(path.join(root, ...file.path.split('/')))) conflicts.push(file.path);
    }
    if (conflicts.length > 0) throw new Error(`Refusing to overwrite: ${conflicts.join(', ')}`);
  }
  for (const file of files) {
    const target = path.join(root, ...file.path.split('/'));
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, file.content, { encoding: 'utf8', flag: options.force ? 'w' : 'wx' });
  }
  if (options.barrel !== false) {
    const barrel = path.join(root, 'src', 'modules', 'index.ts');
    const line = `export * from './${validateFeatureName(rawName)}/index.js';\n`;
    const current = await fs.pathExists(barrel) ? await fs.readFile(barrel, 'utf8') : '';
    if (!current.includes(line)) await fs.outputFile(barrel, current + line, 'utf8');
  }
  return files;
}
