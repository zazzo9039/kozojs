import type { RouteSchema } from './types.js';

/**
 * Client Generator Options
 */
export interface ClientGeneratorOptions {
  /** Include Zod schemas for client-side validation (default: true) */
  includeValidation?: boolean;
  
  /** Base URL for the API (default: '') */
  baseUrl?: string;
  
  /** Enable runtime validation by default (default: false) */
  validateByDefault?: boolean;
  
  /** Custom headers to include in all requests */
  defaultHeaders?: Record<string, string>;
}

/**
 * Route information for client generation
 */
export interface RouteInfo {
  method: string;
  path: string;
  schema: RouteSchema;
  /** Optional: store the Zod schema instance for type extraction */
  zodSchemas?: {
    body?: any;
    query?: any;
    params?: any;
    response?: any;
  };
}

/**
 * Generate a safe method name from a route path
 */
function generateMethodName(method: string, path: string): string {
  // Remove leading/trailing slashes
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  
  // Replace path params with their names
  const withParams = cleanPath.replace(/:(\w+)/g, 'By$1');
  
  // Replace slashes and special chars with underscores
  const safeName = withParams
    .replace(/[\/\-\.]/g, '_')
    .replace(/[^\w]/g, '');
  
  // Prepend method name if not GET
  if (method.toLowerCase() !== 'get') {
    return method.toLowerCase() + safeName.charAt(0).toUpperCase() + safeName.slice(1);
  }
  
  return safeName || 'index';
}

/**
 * Extract path parameters from a route path
 */
function extractPathParams(path: string): string[] {
  const matches = path.match(/:(\w+)/g);
  return matches ? matches.map(m => m.slice(1)) : [];
}

/**
 * Generate typed client code from routes
 */
export function generateTypedClient(
  routes: RouteInfo[],
  options: ClientGeneratorOptions = {}
): string {
  const {
    includeValidation = true,
    baseUrl = '',
    validateByDefault = false,
    defaultHeaders = {}
  } = options;

  const imports: string[] = [];
  const typeDefinitions: string[] = [];
  const schemaExports: string[] = [];
  const methodImplementations: string[] = [];
  
  // Add base imports
  if (includeValidation) {
    imports.push(`import { z } from 'zod';`);
  }

  // Header
  let code = `// Auto-generated Kozo Client\n`;
  code += `// Generated at ${new Date().toISOString()}\n`;
  code += `// DO NOT EDIT - Changes will be overwritten\n\n`;

  // Track schema variable names for type inference
  const schemaVars = new Map<string, string>();

  // Process each route
  for (const route of routes) {
    const methodName = generateMethodName(route.method, route.path);
    const pathParams = extractPathParams(route.path);
    
    // Generate type definitions using z.infer
    let paramsType = 'void';
    let bodyType = 'void';
    let queryType = 'void';
    let responseType = 'unknown';
    
    if (pathParams.length > 0) {
      paramsType = `{ ${pathParams.map(p => `${p}: string`).join('; ')} }`;
    }
    
    if (route.zodSchemas?.body || route.schema.body) {
      const schemaVarName = `${capitalize(methodName)}BodySchema`;
      schemaVars.set(`${methodName}_body`, schemaVarName);
      if (includeValidation) {
        bodyType = `z.infer<typeof ${schemaVarName}>`;
        const src = zodToString(route.zodSchemas?.body ?? route.schema.body);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      }
    }
    
    if (route.zodSchemas?.query || route.schema.query) {
      const schemaVarName = `${capitalize(methodName)}QuerySchema`;
      schemaVars.set(`${methodName}_query`, schemaVarName);
      if (includeValidation) {
        queryType = `z.infer<typeof ${schemaVarName}>`;
        const src = zodToString(route.zodSchemas?.query ?? route.schema.query);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      }
    }
    
    if (route.zodSchemas?.response || route.schema.response) {
      const schemaVarName = `${capitalize(methodName)}ResponseSchema`;
      schemaVars.set(`${methodName}_response`, schemaVarName);
      if (includeValidation) {
        responseType = `z.infer<typeof ${schemaVarName}>`;
        const raw = route.zodSchemas?.response ?? route.schema.response;
        // response may be a status-code map like { 200: z.object(...) }
        const zodSchema = raw && typeof raw === 'object' && !raw._def ? (raw as any)[200] ?? raw : raw;
        const src = zodToString(zodSchema);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      }
    }
    
    // Generate type aliases
    if (bodyType !== 'void' && !bodyType.includes('z.infer')) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Body = ${bodyType};`);
    }
    if (queryType !== 'void' && !queryType.includes('z.infer')) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Query = ${queryType};`);
    }
    if (!responseType.includes('z.infer')) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Response = ${responseType};`);
    }
    
    // Generate method signature
    const args: string[] = [];
    if (paramsType !== 'void') args.push(`params: ${paramsType}`);
    if (bodyType !== 'void') args.push(`body: ${bodyType}`);
    if (queryType !== 'void') args.push(`query?: ${queryType}`);
    
    const argsStr = args.join(', ');
    const returnType = `Promise<${responseType}>`;
    
    // Generate method implementation
    let methodBody = `  async ${methodName}(${argsStr}): ${returnType} {\n`;
    
    // Validation
    if (includeValidation && bodyType !== 'void') {
      const schemaVar = schemaVars.get(`${methodName}_body`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests && ${schemaVar}) {\n`;
        methodBody += `      ${schemaVar}.parse(body);\n`;
        methodBody += `    }\n`;
      }
    }
    
    // URL construction
    let urlExpression = `\`\${this.baseUrl}${route.path}\``;
    if (pathParams.length > 0) {
      // Replace :param with ${params.param}
      const pathWithParams = route.path.replace(/:(\w+)/g, '${params.$1}');
      urlExpression = `\`\${this.baseUrl}${pathWithParams}\``;
    }
    
    methodBody += `    let url = ${urlExpression};\n`;
    
    // Query string
    if (queryType !== 'void') {
      methodBody += `    if (query) {\n`;
      methodBody += `      const queryString = new URLSearchParams(query as any).toString();\n`;
      methodBody += `      url += \`?\${queryString}\`;\n`;
      methodBody += `    }\n`;
    }
    
    // Fetch options
    methodBody += `    const options: RequestInit = {\n`;
    methodBody += `      method: '${route.method.toUpperCase()}',\n`;
    methodBody += `      headers: { ...this.defaultHeaders, 'Content-Type': 'application/json' },\n`;
    if (bodyType !== 'void') {
      methodBody += `      body: JSON.stringify(body),\n`;
    }
    methodBody += `    };\n`;
    
    // Execute request
    methodBody += `    const response = await fetch(url, options);\n`;
    methodBody += `    if (!response.ok) {\n`;
    methodBody += `      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);\n`;
    methodBody += `    }\n`;
    methodBody += `    return response.json();\n`;
    methodBody += `  }\n`;
    
    methodImplementations.push(methodBody);
  }

  // Build final code
  if (imports.length > 0) {
    code += imports.join('\n') + '\n\n';
  }

  if (typeDefinitions.length > 0) {
    code += '// Type Definitions\n';
    code += typeDefinitions.join('\n') + '\n\n';
  }

  if (includeValidation && schemaExports.length > 0) {
    code += '// Zod Schemas\n';
    code += schemaExports.join('\n') + '\n\n';
  }

  // Client class
  code += `export interface KozoClientOptions {\n`;
  code += `  baseUrl?: string;\n`;
  code += `  validateRequests?: boolean;\n`;
  code += `  defaultHeaders?: Record<string, string>;\n`;
  code += `}\n\n`;

  code += `export class KozoClient {\n`;
  code += `  private baseUrl: string;\n`;
  code += `  private validateRequests: boolean;\n`;
  code += `  private defaultHeaders: Record<string, string>;\n\n`;
  
  code += `  constructor(options: KozoClientOptions = {}) {\n`;
  code += `    this.baseUrl = options.baseUrl || '${baseUrl}';\n`;
  code += `    this.validateRequests = options.validateRequests ?? ${validateByDefault};\n`;
  code += `    this.defaultHeaders = options.defaultHeaders || ${JSON.stringify(defaultHeaders)};\n`;
  code += `  }\n\n`;
  
  // Add all methods
  code += methodImplementations.join('\n');
  
  code += `}\n\n`;
  code += `export default KozoClient;\n`;

  return code;
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Serialize a runtime Zod schema back into its z.* builder code.
 * Supports Zod v4 (_zod.def.type) with v3 fallback (_def.typeName).
 * Falls back to `z.any()` for unsupported or unrecognised types.
 */
function zodToString(schema: any): string {
  // Zod v4: schema._zod.def.type  |  Zod v3: schema._def.typeName
  const def4 = schema?._zod?.def;
  const def3 = schema?._def;
  const tn = def4?.type ?? def3?.typeName?.replace(/^Zod/, '').toLowerCase();
  if (!tn) {
    console.warn('[Kozo] zodToString: received schema with no detectable type — falling back to z.any()');
    return 'z.any()';
  }

  switch (tn) {
    case 'string':       return 'z.string()';
    case 'number':       return 'z.number()';
    case 'boolean':      return 'z.boolean()';
    case 'date':         return 'z.date()';
    case 'undefined':    return 'z.undefined()';
    case 'null':         return 'z.null()';
    case 'any':          return 'z.any()';
    case 'unknown':      return 'z.unknown()';
    case 'void':         return 'z.void()';
    case 'literal': {
      // v4: def.values (array), v3: def.value (single)
      const val = def4?.values?.[0] ?? def3?.value;
      return `z.literal(${JSON.stringify(val)})`;
    }
    case 'enum': {
      // v4: def.entries (array of strings), v3: def.values
      const vals = def4?.entries ?? def3?.values;
      return `z.enum(${JSON.stringify(vals)})`;
    }
    case 'nativeenum':
      console.warn('[Kozo] zodToString: z.nativeEnum() cannot be serialized to source code — falling back to z.any()');
      return 'z.any()';
    case 'array': {
      // v4: def.element, v3: def.type
      const inner = def4?.element ?? def3?.type;
      return `z.array(${zodToString(inner)})`;
    }
    case 'object': {
      // v4: def.shape (plain object), v3: def.shape (may be function)
      const shape = def4?.shape ?? (typeof def3?.shape === 'function' ? def3.shape() : def3?.shape);
      if (!shape) return 'z.object({})';
      const props = Object.entries(shape)
        .map(([k, v]) => `${k}: ${zodToString(v)}`)
        .join(', ');
      return `z.object({ ${props} })`;
    }
    case 'optional': {
      const inner = def4?.innerType ?? def3?.innerType;
      return `${zodToString(inner)}.optional()`;
    }
    case 'nullable': {
      const inner = def4?.innerType ?? def3?.innerType;
      return `${zodToString(inner)}.nullable()`;
    }
    case 'default': {
      const inner = def4?.innerType ?? def3?.innerType;
      const dv = def4?.defaultValue ?? def3?.defaultValue?.();
      return `${zodToString(inner)}.default(${JSON.stringify(dv)})`;
    }
    case 'union': {
      const opts = def4?.options ?? def3?.options ?? [];
      return `z.union([${opts.map(zodToString).join(', ')}])`;
    }
    case 'intersection': {
      const left = def4?.left ?? def3?.left;
      const right = def4?.right ?? def3?.right;
      return `z.intersection(${zodToString(left)}, ${zodToString(right)})`;
    }
    case 'record': {
      const vt = def4?.valueType ?? def3?.valueType;
      return `z.record(${zodToString(vt)})`;
    }
    case 'tuple': {
      const items = def4?.items ?? def3?.items ?? [];
      return `z.tuple([${items.map(zodToString).join(', ')}])`;
    }
    case 'effects':  return zodToString(def3?.schema);
    case 'pipeline': return zodToString(def3?.in ?? def4?.in);
    default:
      console.warn(`[Kozo] zodToString: unsupported Zod type "${tn}" — falling back to z.any()`);
      return 'z.any()';
  }
}
