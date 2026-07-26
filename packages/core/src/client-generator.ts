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
    headers?: any;
    response?: any;
  };
}

const RESERVED_CLIENT_MEMBERS = new Set([
  'baseUrl',
  'constructor',
  'defaultHeaders',
  'fetchImpl',
  'getToken',
  'onError',
  'onRequest',
  'onUnauthorized',
  'request',
  'validateRequests',
]);

function identifierWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function toPascalCase(value: string): string {
  return identifierWords(value)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Generate a readable JavaScript method name from an HTTP method and route.
 *
 * Examples:
 *   GET   /users/:id                 -> usersById
 *   PATCH /user-profiles/:userId    -> patchUserProfilesByUserId
 */
function generateMethodName(method: string, routePath: string): string {
  const pathName = routePath
    .split('/')
    .filter(Boolean)
    .map(segment => {
      if (segment.startsWith(':')) {
        return `By${toPascalCase(segment.slice(1)) || 'Param'}`;
      }
      return toPascalCase(segment) || 'Wildcard';
    })
    .join('');

  const baseName = pathName
    ? pathName.charAt(0).toLowerCase() + pathName.slice(1)
    : 'index';
  const safeBaseName = /^\d/.test(baseName) ? `route${baseName}` : baseName;
  const httpMethod = method.toLowerCase();
  let methodName = httpMethod === 'get'
    ? safeBaseName
    : httpMethod + capitalize(safeBaseName);

  // A GET route can otherwise overwrite fields or the shared request method.
  if (RESERVED_CLIENT_MEMBERS.has(methodName)) {
    methodName = `get${capitalize(methodName)}`;
  }

  return methodName;
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
  const methodNames = new Map<string, RouteInfo>();

  // Process each route
  for (const route of routes) {
    const methodName = generateMethodName(route.method, route.path);
    const conflictingRoute = methodNames.get(methodName);
    if (conflictingRoute) {
      throw new Error(
        `[Kozo] Cannot generate client: ` +
        `${conflictingRoute.method.toUpperCase()} ${conflictingRoute.path} and ` +
        `${route.method.toUpperCase()} ${route.path} both map to "${methodName}". ` +
        'Rename one route so each generated client method is unique.',
      );
    }
    methodNames.set(methodName, route);
    const pathParams = extractPathParams(route.path);
    
    // Generate type definitions using z.infer
    let paramsType = 'void';
    let bodyType = 'void';
    let queryType = 'void';
    let headersType = 'void';
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

    if (route.zodSchemas?.headers || route.schema.headers) {
      const schemaVarName = `${capitalize(methodName)}HeadersSchema`;
      schemaVars.set(`${methodName}_headers`, schemaVarName);
      if (includeValidation) {
        headersType = `z.infer<typeof ${schemaVarName}>`;
        const src = zodToString(route.zodSchemas?.headers ?? route.schema.headers);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      }
    }
    
    if (route.zodSchemas?.response || route.schema.response) {
      const schemaVarName = `${capitalize(methodName)}ResponseSchema`;
      schemaVars.set(`${methodName}_response`, schemaVarName);
      if (includeValidation) {
        responseType = `z.infer<typeof ${schemaVarName}>`;
        const raw = route.zodSchemas?.response ?? route.schema.response;
        // Generated methods throw on non-2xx responses. Prefer status 200,
        // otherwise use the first declared successful response such as 201.
        const responseMap = raw
          && typeof raw === 'object'
          && !raw._def
          && !raw._zod
          ? raw as Record<string, unknown>
          : undefined;
        const successSchema = responseMap
          ? Object.entries(responseMap)
            .sort(([left], [right]) => Number(left) - Number(right))
            .find(([status]) => Number(status) >= 200 && Number(status) < 300)?.[1]
          : undefined;
        const zodSchema = responseMap?.[200] ?? successSchema ?? raw;
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
    if (headersType !== 'void' && !headersType.includes('z.infer')) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Headers = ${headersType};`);
    }
    if (!responseType.includes('z.infer')) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Response = ${responseType};`);
    }
    
    // Generate method signature
    const args: string[] = [];
    if (paramsType !== 'void') args.push(`params: ${paramsType}`);
    if (bodyType !== 'void') args.push(`body: ${bodyType}`);
    if (queryType !== 'void') args.push(`query?: ${queryType}`);
    if (headersType !== 'void') args.push(`headers: ${headersType}`);
    args.push('init?: KozoRequestInit');

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

    if (includeValidation && headersType !== 'void') {
      const schemaVar = schemaVars.get(`${methodName}_headers`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests && ${schemaVar}) {\n`;
        methodBody += `      ${schemaVar}.parse(headers);\n`;
        methodBody += `    }\n`;
      }
    }

    // URL construction
    let urlExpression = `\`\${this.baseUrl}${route.path}\``;
    if (pathParams.length > 0) {
      // Replace :param with ${params.param}
      const pathWithParams = route.path.replace(
        /:(\w+)/g,
        '${encodeURIComponent(String(params.$1))}',
      );
      urlExpression = `\`\${this.baseUrl}${pathWithParams}\``;
    }

    methodBody += `    let url = ${urlExpression};\n`;

    // Query string (null/undefined values are dropped, not serialized as "undefined")
    if (queryType !== 'void') {
      methodBody += `    if (query) {\n`;
      methodBody += `      const qs = new URLSearchParams();\n`;
      methodBody += `      for (const [k, v] of Object.entries(query)) {\n`;
      methodBody += `        if (Array.isArray(v)) {\n`;
      methodBody += `          for (const item of v) {\n`;
      methodBody += `            if (item !== undefined && item !== null) qs.append(k, String(item));\n`;
      methodBody += `          }\n`;
      methodBody += `        } else if (v !== undefined && v !== null) {\n`;
      methodBody += `          qs.append(k, String(v));\n`;
      methodBody += `        }\n`;
      methodBody += `      }\n`;
      methodBody += `      const queryString = qs.toString();\n`;
      methodBody += `      if (queryString) url += \`?\${queryString}\`;\n`;
      methodBody += `    }\n`;
    }

    // Delegate to the shared transport (auth, hooks, RFC 7807 errors)
    const requestArgs = [`method: '${route.method.toUpperCase()}'`];
    if (bodyType !== 'void') requestArgs.push('body');
    requestArgs.push(
      'signal: init?.signal',
      headersType !== 'void'
        ? 'headers: { ...headers, ...init?.headers }'
        : 'headers: init?.headers',
    );
    methodBody += `    return this.request(url, { ${requestArgs.join(', ')} });\n`;
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

  // Shared runtime: per-request init, RFC 7807 error, client options
  code += `/** Per-request overrides accepted by every client method. */\n`;
  code += `export interface KozoRequestInit {\n`;
  code += `  signal?: AbortSignal;\n`;
  code += `  headers?: Record<string, string>;\n`;
  code += `}\n\n`;

  code += `/** RFC 7807 problem details (application/problem+json). */\n`;
  code += `export interface KozoProblemDetails {\n`;
  code += `  type?: string;\n`;
  code += `  title?: string;\n`;
  code += `  status?: number;\n`;
  code += `  detail?: string;\n`;
  code += `  instance?: string;\n`;
  code += `  [key: string]: unknown;\n`;
  code += `}\n\n`;

  code += `/** Thrown on every non-2xx response. Carries the parsed body and RFC 7807 fields. */\n`;
  code += `export class KozoApiError extends Error {\n`;
  code += `  readonly status: number;\n`;
  code += `  readonly problem: KozoProblemDetails | null;\n`;
  code += `  readonly body: unknown;\n\n`;
  code += `  constructor(status: number, body: unknown) {\n`;
  code += `    const problem = body !== null && typeof body === 'object' && !Array.isArray(body)\n`;
  code += `      ? (body as KozoProblemDetails)\n`;
  code += `      : null;\n`;
  code += `    const title = problem && typeof problem.title === 'string' ? problem.title : null;\n`;
  code += `    const message = problem && typeof (problem as { message?: unknown }).message === 'string'\n`;
  code += `      ? (problem as { message: string }).message\n`;
  code += `      : null;\n`;
  code += `    super(title ?? message ?? 'API error ' + status);\n`;
  code += `    this.name = 'KozoApiError';\n`;
  code += `    this.status = status;\n`;
  code += `    this.problem = problem;\n`;
  code += `    this.body = body;\n`;
  code += `  }\n`;
  code += `}\n\n`;

  code += `export interface KozoClientOptions {\n`;
  code += `  baseUrl?: string;\n`;
  code += `  validateRequests?: boolean;\n`;
  code += `  defaultHeaders?: Record<string, string>;\n`;
  code += `  /** Bearer token provider, called per request; skipped when it returns null/undefined. */\n`;
  code += `  getToken?: () => string | null | undefined | Promise<string | null | undefined>;\n`;
  code += `  /** Inspect/mutate url and headers right before the request is sent. */\n`;
  code += `  onRequest?: (req: { url: string; method: string; headers: Record<string, string> }) => void | Promise<void>;\n`;
  code += `  /** Called on 401 responses when a request was sent (e.g. clear session, redirect to login). */\n`;
  code += `  onUnauthorized?: (error: KozoApiError) => void | Promise<void>;\n`;
  code += `  /** Called for every non-2xx response, before the KozoApiError is thrown. */\n`;
  code += `  onError?: (error: KozoApiError) => void | Promise<void>;\n`;
  code += `  /** Custom fetch implementation (default: globalThis.fetch). */\n`;
  code += `  fetch?: typeof fetch;\n`;
  code += `}\n\n`;

  code += `export class KozoClient {\n`;
  code += `  private baseUrl: string;\n`;
  code += `  private validateRequests: boolean;\n`;
  code += `  private defaultHeaders: Record<string, string>;\n`;
  code += `  private getToken?: KozoClientOptions['getToken'];\n`;
  code += `  private onRequest?: KozoClientOptions['onRequest'];\n`;
  code += `  private onUnauthorized?: KozoClientOptions['onUnauthorized'];\n`;
  code += `  private onError?: KozoClientOptions['onError'];\n`;
  code += `  private fetchImpl: typeof fetch;\n\n`;

  code += `  constructor(options: KozoClientOptions = {}) {\n`;
  code += `    this.baseUrl = options.baseUrl || '${baseUrl}';\n`;
  code += `    this.validateRequests = options.validateRequests ?? ${validateByDefault};\n`;
  code += `    this.defaultHeaders = options.defaultHeaders || ${JSON.stringify(defaultHeaders)};\n`;
  code += `    this.getToken = options.getToken;\n`;
  code += `    this.onRequest = options.onRequest;\n`;
  code += `    this.onUnauthorized = options.onUnauthorized;\n`;
  code += `    this.onError = options.onError;\n`;
  code += `    this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));\n`;
  code += `  }\n\n`;

  code += `  /** Shared transport: bearer auth, request hook, 204/non-JSON handling, RFC 7807 errors. */\n`;
  code += `  protected async request<T>(\n`;
  code += `    url: string,\n`;
  code += `    { method, body, signal, headers: extraHeaders }: { method: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> },\n`;
  code += `  ): Promise<T> {\n`;
  code += `    const headers: Record<string, string> = { ...this.defaultHeaders, ...extraHeaders };\n`;
  code += `    if (body !== undefined && headers['Content-Type'] === undefined) {\n`;
  code += `      headers['Content-Type'] = 'application/json';\n`;
  code += `    }\n`;
  code += `    const token = this.getToken ? await this.getToken() : null;\n`;
  code += `    if (token) headers['Authorization'] = 'Bearer ' + token;\n`;
  code += `    const req = { url, method, headers };\n`;
  code += `    if (this.onRequest) await this.onRequest(req);\n`;
  code += `    const response = await this.fetchImpl(req.url, {\n`;
  code += `      method,\n`;
  code += `      headers: req.headers,\n`;
  code += `      body: body !== undefined ? JSON.stringify(body) : undefined,\n`;
  code += `      signal,\n`;
  code += `    });\n`;
  code += `    const contentType = response.headers.get('content-type') ?? '';\n`;
  code += `    const data = response.status === 204\n`;
  code += `      ? null\n`;
  code += `      : contentType.includes('json')\n`;
  code += `        ? await response.json().catch(() => null)\n`;
  code += `        : await response.text();\n`;
  code += `    if (!response.ok) {\n`;
  code += `      const error = new KozoApiError(response.status, data);\n`;
  code += `      if (response.status === 401 && this.onUnauthorized) await this.onUnauthorized(error);\n`;
  code += `      if (this.onError) await this.onError(error);\n`;
  code += `      throw error;\n`;
  code += `    }\n`;
  code += `    return data as T;\n`;
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
      // v4: def.entries is a key/value object; v3: def.values is an array.
      const entries = def4?.entries ?? def3?.values;
      const vals = Array.isArray(entries) ? entries : Object.values(entries ?? {});
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
      // Zod v4 removed the single-argument z.record(value): the key type is
      // mandatory. Serialize it when present, default to z.string().
      const kt = def4?.keyType ?? def3?.keyType;
      const vt = def4?.valueType ?? def3?.valueType;
      return `z.record(${kt ? zodToString(kt) : 'z.string()'}, ${zodToString(vt)})`;
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
