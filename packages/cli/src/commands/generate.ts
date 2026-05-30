import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs-extra';
import path from 'node:path';

const ROUTE_TEMPLATE = `import { z } from 'zod';
import type { HandlerContext } from '@kozojs/core';

// Validation schema (optional)
export const schema = {
  body: z.object({
    // Define your schema here
  })
};

type Body = z.infer<typeof schema.body>;

export default async ({ body, services }: HandlerContext<Body>) => {
  // TODO: Implement handler
  return { message: 'Not implemented' };
};
`;

const GET_ROUTE_TEMPLATE = `import type { HandlerContext } from '@kozojs/core';

export default async ({ params, services }: HandlerContext) => {
  // TODO: Implement handler
  return { message: 'Not implemented' };
};
`;

const MIDDLEWARE_TEMPLATE = `import type { Context, Next } from 'hono';

export async function {{name}}(c: Context, next: Next) {
  // Before handler
  console.log('{{name}} middleware - before');
  
  await next();
  
  // After handler
  console.log('{{name}} middleware - after');
}
`;

const DIR_MIDDLEWARE_TEMPLATE = `import type { Context, Next } from 'hono';

/**
 * Per-directory middleware — applies to all routes in this directory and below.
 * Place this file as _middleware.ts in any route directory.
 */
export default async function (c: Context, next: Next) {
  // Before handler — add auth checks, logging, etc.
  
  await next();
  
  // After handler
}
`;

const SERVICE_TEMPLATE = `/**
 * {{Name}} service
 *
 * Register in your app:
 *   import { {{name}}Service } from './services/{{name}}';
 *   const app = createKozo({ services: { {{name}}: {{name}}Service } });
 */

export interface {{Name}}Service {
  // Define your service methods here
}

export function create{{Name}}Service(): {{Name}}Service {
  return {
    // Implement your service methods here
  };
}

export const {{name}}Service = create{{Name}}Service();
`;

export async function generateCommand(type: string, name?: string): Promise<void> {
  if (!type) {
    p.log.error('Please specify what to generate: route, middleware, dir-middleware, service');
    process.exit(1);
  }

  switch (type.toLowerCase()) {
    case 'route':
    case 'r':
      await generateRoute(name);
      break;
    case 'middleware':
    case 'mw':
      await generateMiddleware(name);
      break;
    case 'dir-middleware':
    case 'dmw':
      await generateDirMiddleware(name);
      break;
    case 'service':
    case 's':
      await generateService(name);
      break;
    default:
      p.log.error(`Unknown generator: ${type}`);
      p.log.info('Available: route, middleware, dir-middleware, service');
      process.exit(1);
  }
}

async function generateRoute(routePath?: string): Promise<void> {
  let targetPath = routePath;

  if (!targetPath) {
    const result = await p.text({
      message: 'Route path (e.g., users/profile)',
      placeholder: 'users/[id]',
      validate: (v) => !v ? 'Path is required' : undefined
    });

    if (p.isCancel(result)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    targetPath = result;
  }

  const method = await p.select({
    message: 'HTTP method',
    options: [
      { value: 'get', label: 'GET' },
      { value: 'post', label: 'POST' },
      { value: 'put', label: 'PUT' },
      { value: 'patch', label: 'PATCH' },
      { value: 'delete', label: 'DELETE' }
    ]
  });

  if (p.isCancel(method)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  // Build file path
  const routesDir = path.join(process.cwd(), 'src', 'routes');
  const filePath = path.join(routesDir, targetPath, `${method}.ts`);

  // Check if file exists
  if (await fs.pathExists(filePath)) {
    const overwrite = await p.confirm({
      message: `File ${filePath} already exists. Overwrite?`,
      initialValue: false
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Cancelled');
      process.exit(0);
    }
  }

  // Create file
  await fs.ensureDir(path.dirname(filePath));
  
  const template = method === 'get' ? GET_ROUTE_TEMPLATE : ROUTE_TEMPLATE;
  await fs.writeFile(filePath, template);

  const relativePath = path.relative(process.cwd(), filePath);
  p.log.success(`Created ${pc.cyan(relativePath)}`);

  // Show resulting endpoint
  const urlPath = '/' + targetPath.replace(/\[([^\]]+)\]/g, ':$1');
  console.log(`\n  ${pc.bold(String(method).toUpperCase())} ${pc.green(urlPath)}\n`);
}

async function generateMiddleware(middlewareName?: string): Promise<void> {
  let name = middlewareName;

  if (!name) {
    const result = await p.text({
      message: 'Middleware name',
      placeholder: 'auth',
      validate: (v) => !v ? 'Name is required' : undefined
    });

    if (p.isCancel(result)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    name = result;
  }

  const middlewareDir = path.join(process.cwd(), 'src', 'middleware');
  const filePath = path.join(middlewareDir, `${name}.ts`);

  // Check if file exists
  if (await fs.pathExists(filePath)) {
    const overwrite = await p.confirm({
      message: `File ${filePath} already exists. Overwrite?`,
      initialValue: false
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Cancelled');
      process.exit(0);
    }
  }

  // Create file
  await fs.ensureDir(middlewareDir);
  
  const content = MIDDLEWARE_TEMPLATE.replace(/\{\{name\}\}/g, name);
  await fs.writeFile(filePath, content);

  const relativePath = path.relative(process.cwd(), filePath);
  p.log.success(`Created ${pc.cyan(relativePath)}`);
}

async function generateDirMiddleware(routePath?: string): Promise<void> {
  let targetPath = routePath;

  if (!targetPath) {
    const result = await p.text({
      message: 'Route directory (e.g., admin, api/v2)',
      placeholder: 'admin',
      validate: (v) => !v ? 'Path is required' : undefined,
    });

    if (p.isCancel(result)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    targetPath = result;
  }

  const routesDir = path.join(process.cwd(), 'src', 'routes');
  const filePath = path.join(routesDir, targetPath, '_middleware.ts');

  if (await fs.pathExists(filePath)) {
    const overwrite = await p.confirm({
      message: `File ${path.relative(process.cwd(), filePath)} already exists. Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Cancelled');
      process.exit(0);
    }
  }

  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, DIR_MIDDLEWARE_TEMPLATE);

  const relativePath = path.relative(process.cwd(), filePath);
  p.log.success(`Created ${pc.cyan(relativePath)}`);

  const urlPrefix = '/' + targetPath.replace(/\\/g, '/') + '/*';
  console.log(`\n  🛡️  Applies to: ${pc.green(urlPrefix)}\n`);
}

async function generateService(serviceName?: string): Promise<void> {
  let name = serviceName;

  if (!name) {
    const result = await p.text({
      message: 'Service name (e.g., email, payment)',
      placeholder: 'email',
      validate: (v) => !v ? 'Name is required' : undefined,
    });

    if (p.isCancel(result)) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    name = result;
  }

  const servicesDir = path.join(process.cwd(), 'src', 'services');
  const filePath = path.join(servicesDir, `${name}.ts`);

  if (await fs.pathExists(filePath)) {
    const overwrite = await p.confirm({
      message: `File ${path.relative(process.cwd(), filePath)} already exists. Overwrite?`,
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel('Cancelled');
      process.exit(0);
    }
  }

  // Capitalize first letter for type name
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);

  await fs.ensureDir(servicesDir);
  const content = SERVICE_TEMPLATE
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{Name\}\}/g, capitalized);
  await fs.writeFile(filePath, content);

  const relativePath = path.relative(process.cwd(), filePath);
  p.log.success(`Created ${pc.cyan(relativePath)}`);
  console.log(`\n  Register in your app:\n  ${pc.dim(`services: { ${name}: ${name}Service }`)}\n`);
}
