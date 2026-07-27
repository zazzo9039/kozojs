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
function extractPathParams(
  path: string,
): Array<{ name: string; optional: boolean }> {
  return path
    .split('/')
    .filter(segment => segment === '*' || segment.startsWith(':'))
    .map(segment => {
      if (segment === '*') return { name: 'wildcard', optional: false };
      const optional = segment.endsWith('?');
      return {
        name: segment.slice(1, optional ? -1 : undefined),
        optional,
      };
    });
}

type GeneratedResponseEntry = {
  status: number;
  schema: unknown;
  schemaName: string | null;
  bodyType: string;
};

type GeneratedClientRoute = {
  route: RouteInfo;
  inputType: string;
  inputRequired: boolean;
  paramsType: string | null;
  bodyType: string | null;
  queryType: string | null;
  headersType: string | null;
  paramsSchemaName: string | null;
  bodySchemaName: string | null;
  querySchemaName: string | null;
  headersSchemaName: string | null;
  resultType: string;
  declaredStatuses: number[];
};

type GeneratedRouteTreeNode = {
  children: Map<string, GeneratedRouteTreeNode>;
  segmentSources: Map<string, string>;
  operations: Map<string, GeneratedClientRoute>;
};

function createGeneratedRouteTreeNode(): GeneratedRouteTreeNode {
  return {
    children: new Map(),
    segmentSources: new Map(),
    operations: new Map(),
  };
}

function normalizeClientTreeSegment(segment: string): string {
  if (segment === '*') return '$wildcard';

  const dynamic = segment.startsWith(':');
  const source = dynamic ? segment.slice(1).replace(/\?$/, '') : segment;
  if (!/^[A-Za-z0-9._-]+$/.test(source)) {
    throw new Error(
      `[Kozo] Cannot generate client: route segment "${segment}" ` +
      'contains unsupported characters.',
    );
  }

  const parts = source.split(/[._-]+/).filter(Boolean);
  let normalized = parts
    .map((part, index) => index === 0
      ? part
      : part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  if (!normalized) normalized = 'index';
  if (/^\d/.test(normalized)) {
    normalized = `route${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }
  return dynamic ? `$${normalized}` : normalized;
}

function isZodSchema(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && ('_def' in value || '_zod' in value);
}

function asResponseMap(value: unknown): Record<string, unknown> | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || isZodSchema(value)
  ) {
    return null;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  if (entries.some(([status]) => !/^\d{3}$/.test(status))) return null;
  return value as Record<string, unknown>;
}

function schemaAccepts(schema: unknown, value: unknown): boolean {
  if (
    schema === null
    || typeof schema !== 'object'
    || !('safeParse' in schema)
    || typeof (schema as { safeParse?: unknown }).safeParse !== 'function'
  ) {
    return false;
  }

  try {
    return (schema as {
      safeParse(value: unknown): { success: boolean };
    }).safeParse(value).success;
  } catch {
    return false;
  }
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
  const generatedRoutes: GeneratedClientRoute[] = [];
  
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
    
    const typeName = capitalize(methodName);

    // Generate type definitions using Zod input/output types.
    let paramsType = 'void';
    let bodyType = 'void';
    let queryType = 'void';
    let headersType = 'void';
    let responseType = 'unknown';
    let paramsSchemaName: string | null = null;
    let bodySchemaName: string | null = null;
    let querySchemaName: string | null = null;
    let headersSchemaName: string | null = null;
    let responseEntries: GeneratedResponseEntry[] = [];

    if (pathParams.length > 0) {
      paramsType = `{ ${pathParams
        .map(param =>
          `${param.name}${param.optional ? '?' : ''}: string | number | boolean`,
        )
        .join('; ')} }`;
    }

    if (route.zodSchemas?.params || route.schema.params) {
      paramsSchemaName = `${typeName}ParamsSchema`;
      schemaVars.set(`${methodName}_params`, paramsSchemaName);
      if (includeValidation) {
        const src = zodToString(route.zodSchemas?.params ?? route.schema.params);
        schemaExports.push(`export const ${paramsSchemaName} = ${src};`);
        const schemaType = `z.input<typeof ${paramsSchemaName}>`;
        paramsType = paramsType === 'void'
          ? schemaType
          : `${schemaType} & ${paramsType}`;
      } else if (paramsType === 'void') {
        paramsType = 'unknown';
      }
    }

    if (route.zodSchemas?.body || route.schema.body) {
      const schemaVarName = `${typeName}BodySchema`;
      bodySchemaName = schemaVarName;
      schemaVars.set(`${methodName}_body`, schemaVarName);
      if (includeValidation) {
        bodyType = `z.input<typeof ${schemaVarName}>`;
        const src = zodToString(route.zodSchemas?.body ?? route.schema.body);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      } else {
        bodyType = 'unknown';
      }
    }

    if (route.zodSchemas?.query || route.schema.query) {
      const schemaVarName = `${typeName}QuerySchema`;
      querySchemaName = schemaVarName;
      schemaVars.set(`${methodName}_query`, schemaVarName);
      if (includeValidation) {
        queryType = `z.input<typeof ${schemaVarName}>`;
        const src = zodToString(route.zodSchemas?.query ?? route.schema.query);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      } else {
        queryType = 'unknown';
      }
    }

    if (route.zodSchemas?.headers || route.schema.headers) {
      const schemaVarName = `${typeName}HeadersSchema`;
      headersSchemaName = schemaVarName;
      schemaVars.set(`${methodName}_headers`, schemaVarName);
      if (includeValidation) {
        headersType = `z.input<typeof ${schemaVarName}>`;
        const src = zodToString(route.zodSchemas?.headers ?? route.schema.headers);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      } else {
        headersType = 'unknown';
      }
    }

    if (route.zodSchemas?.response || route.schema.response) {
      const schemaVarName = `${typeName}ResponseSchema`;
      const raw = route.schema.response ?? route.zodSchemas?.response;
      const responseMap = asResponseMap(raw);

      if (responseMap) {
        responseEntries = Object.entries(responseMap)
          .map(([status, schema]) => ({
            status: Number(status),
            schema,
            schemaName: includeValidation
              ? `${typeName}Response${status}Schema`
              : null,
            bodyType: includeValidation
              ? `z.output<typeof ${typeName}Response${status}Schema>`
              : 'unknown',
          }))
          .sort((left, right) => left.status - right.status);

        if (includeValidation) {
          for (const entry of responseEntries) {
            schemaExports.push(
              `export const ${entry.schemaName} = ${zodToString(entry.schema)};`,
            );
          }
        }

        const successEntry = responseEntries.find(entry => entry.status === 200)
          ?? responseEntries.find(entry => entry.status >= 200 && entry.status < 300);
        if (successEntry) {
          responseType = successEntry.bodyType;
          if (includeValidation) {
            schemaExports.push(
              `/** @deprecated Use the status-specific response schemas. */\n` +
              `export const ${schemaVarName} = ${successEntry.schemaName};`,
            );
          }
        }
      } else {
        if (includeValidation) {
          responseType = `z.output<typeof ${schemaVarName}>`;
          schemaExports.push(`export const ${schemaVarName} = ${zodToString(raw)};`);
        }
      }
    }
    
    // Generate type aliases
    if (bodyType !== 'void' && !bodyType.includes('z.input')) {
      typeDefinitions.push(`export type ${typeName}Body = ${bodyType};`);
    }
    if (queryType !== 'void' && !queryType.includes('z.input')) {
      typeDefinitions.push(`export type ${typeName}Query = ${queryType};`);
    }
    if (headersType !== 'void' && !headersType.includes('z.input')) {
      typeDefinitions.push(`export type ${typeName}Headers = ${headersType};`);
    }
    if (!responseType.includes('z.output')) {
      typeDefinitions.push(`export type ${typeName}Response = ${responseType};`);
    }

    const inputFields: string[] = [];
    let inputRequired = false;
    if (paramsType !== 'void') {
      inputFields.push(`  params: ${paramsType};`);
      inputRequired = true;
    }
    if (bodyType !== 'void') {
      const bodySchema = route.zodSchemas?.body ?? route.schema.body;
      const optional = schemaAccepts(bodySchema, undefined);
      inputFields.push(`  body${optional ? '?' : ''}: ${bodyType};`);
      inputRequired ||= !optional;
    }
    if (queryType !== 'void') {
      const querySchema = route.zodSchemas?.query ?? route.schema.query;
      const optional = schemaAccepts(querySchema, undefined)
        || schemaAccepts(querySchema, {});
      inputFields.push(`  query${optional ? '?' : ''}: ${queryType};`);
      inputRequired ||= !optional;
    }
    if (headersType !== 'void') {
      const headersSchema = route.zodSchemas?.headers ?? route.schema.headers;
      const optional = schemaAccepts(headersSchema, undefined)
        || schemaAccepts(headersSchema, {});
      inputFields.push(`  headers${optional ? '?' : ''}: ${headersType};`);
      inputRequired ||= !optional;
    }
    inputFields.push('  init?: KozoRequestInit;');
    const inputType = `${typeName}Input`;
    typeDefinitions.push(
      `export interface ${inputType} {\n${inputFields.join('\n')}\n}`,
    );

    const resultType = `${typeName}Result`;
    const resultDefinition = responseEntries.length > 0
      ? responseEntries
        .map(entry =>
          `KozoClientResponse<${entry.status}, ${entry.bodyType}>`,
        )
        .join(' | ')
      : `KozoClientResponse<number, ${responseType}>`;
    typeDefinitions.push(`export type ${resultType} = ${resultDefinition};`);

    generatedRoutes.push({
      route,
      inputType,
      inputRequired,
      paramsType: paramsType === 'void' ? null : paramsType,
      bodyType: bodyType === 'void' ? null : bodyType,
      queryType: queryType === 'void' ? null : queryType,
      headersType: headersType === 'void' ? null : headersType,
      paramsSchemaName,
      bodySchemaName,
      querySchemaName,
      headersSchemaName,
      resultType,
      declaredStatuses: responseEntries.map(entry => entry.status),
    });

    // Generate method signature
    const args: string[] = [];
    if (paramsType !== 'void') args.push(`params: ${paramsType}`);
    if (bodyType !== 'void') args.push(`body: ${bodyType}`);
    if (queryType !== 'void') {
      args.push(headersType !== 'void'
        ? `query: ${queryType} | undefined`
        : `query?: ${queryType}`);
    }
    if (headersType !== 'void') args.push(`headers: ${headersType}`);
    args.push('init?: KozoRequestInit');

    const argsStr = args.join(', ');
    const returnType = `Promise<${responseType}>`;

    // Generate method implementation
    const routeSegments = route.path.split('/').filter(Boolean)
      .map(normalizeClientTreeSegment);
    const routeTreePath = [
      'api',
      ...routeSegments,
      route.method.toLowerCase(),
    ].join('.');
    let methodBody =
      `  /** @deprecated Use ${routeTreePath}({ ... }) from createKozoClient(). */\n` +
      `  async ${methodName}(${argsStr}): ${returnType} {\n`;

    // Validation
    if (includeValidation && paramsType !== 'void') {
      const schemaVar = schemaVars.get(`${methodName}_params`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(params);\n`;
      }
    }

    if (includeValidation && bodyType !== 'void') {
      const schemaVar = schemaVars.get(`${methodName}_body`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(body);\n`;
      }
    }

    if (includeValidation && queryType !== 'void') {
      const schemaVar = schemaVars.get(`${methodName}_query`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(query ?? {});\n`;
      }
    }

    if (includeValidation && headersType !== 'void') {
      const schemaVar = schemaVars.get(`${methodName}_headers`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(headers ?? {});\n`;
      }
    }

    // URL construction
    let urlExpression = `\`\${this.baseUrl}${route.path}\``;
    if (pathParams.length > 0) {
      urlExpression =
        `this.baseUrl + materializePath(${JSON.stringify(route.path)}, params)`;
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
        ? 'headers: mergeHeaders(headers, init?.headers)'
        : 'headers: init?.headers',
    );
    methodBody += `    return this.request(url, { ${requestArgs.join(', ')} });\n`;
    methodBody += `  }\n`;

    methodImplementations.push(methodBody);
  }

  const routeTree = createGeneratedRouteTreeNode();
  for (const generated of generatedRoutes) {
    const pathSegments = generated.route.path.split('/').filter(Boolean);
    let node = routeTree;

    for (const source of pathSegments) {
      const key = normalizeClientTreeSegment(source);
      const previousSource = node.segmentSources.get(key);
      if (previousSource !== undefined && previousSource !== source) {
        throw new Error(
          `[Kozo] Cannot generate client: route segments ` +
          `"${previousSource}" and "${source}" both normalize to "${key}".`,
        );
      }
      node.segmentSources.set(key, source);

      let child = node.children.get(key);
      if (!child) {
        child = createGeneratedRouteTreeNode();
        node.children.set(key, child);
      }
      node = child;
    }

    const method = generated.route.method.toLowerCase();
    const existing = node.operations.get(method);
    if (existing) {
      throw new Error(
        `[Kozo] Cannot generate client: duplicate operation ` +
        `${generated.route.method.toUpperCase()} ${generated.route.path}.`,
      );
    }
    node.operations.set(method, generated);
  }

  const renderOperation = (
    generated: GeneratedClientRoute,
    indent: string,
  ): string => {
    const { route } = generated;
    const inputDefault = generated.inputRequired ? '' : ' = {}';
    let source =
      `async (input: ${generated.inputType}${inputDefault}): ` +
      `Promise<${generated.resultType}> => {\n`;

    if (includeValidation) {
      if (generated.paramsSchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.paramsSchemaName}, input.params);\n`;
      }
      if (generated.bodySchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.bodySchemaName}, input.body);\n`;
      }
      if (generated.querySchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.querySchemaName}, input.query ?? {});\n`;
      }
      if (generated.headersSchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.headersSchemaName}, input.headers ?? {});\n`;
      }
    }

    source +=
      `${indent}  let path = materializePath(${JSON.stringify(route.path)}, ` +
      `${generated.paramsType ? 'input.params' : 'undefined'});\n`;
    if (generated.queryType) {
      source += `${indent}  path = appendQuery(path, input.query);\n`;
    }

    const requestArgs = [`method: '${route.method.toUpperCase()}'`];
    if (generated.bodyType) requestArgs.push('body: input.body');
    requestArgs.push(
      'signal: input.init?.signal',
      generated.headersType
        ? 'headers: mergeHeaders(input.headers, input.init?.headers)'
        : 'headers: input.init?.headers',
    );
    source +=
      `${indent}  return transport._kozoRequestContract<${generated.resultType}>(\n` +
      `${indent}    path,\n` +
      `${indent}    { ${requestArgs.join(', ')} },\n` +
      `${indent}    ${JSON.stringify(generated.declaredStatuses)},\n` +
      `${indent}  );\n` +
      `${indent}}`;
    return source;
  };

  const renderTreeNode = (
    node: GeneratedRouteTreeNode,
    indent: string,
  ): string => {
    const keys = [
      ...new Set([
        ...node.children.keys(),
        ...node.operations.keys(),
      ]),
    ];
    if (keys.length === 0) return '{}';

    const properties = keys.map(key => {
      const child = node.children.get(key);
      const operation = node.operations.get(key);
      let value: string;

      if (operation && child) {
        value =
          `Object.assign(\n` +
          `${indent}  ${renderOperation(operation, `${indent}  `)},\n` +
          `${indent}  ${renderTreeNode(child, `${indent}  `)},\n` +
          `${indent})`;
      } else if (operation) {
        value = renderOperation(operation, indent);
      } else {
        value = renderTreeNode(child!, `${indent}  `);
      }

      return `${indent}${JSON.stringify(key)}: ${value}`;
    });

    return `{\n${properties.join(',\n')}\n${indent.slice(2)}}`;
  };

  const routeTreeSource = renderTreeNode(routeTree, '    ');

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

  code += `export type KozoResponseOk<TStatus extends number> =\n`;
  code += `  number extends TStatus ? boolean :\n`;
  code += `  \`\${TStatus}\` extends \`2\${string}\` ? true : false;\n\n`;

  code += `/** A status-discriminated response returned by the route-tree client. */\n`;
  code += `export interface KozoClientResponse<TStatus extends number, TBody> {\n`;
  code += `  status: TStatus;\n`;
  code += `  headers: Headers;\n`;
  code += `  body: TBody;\n`;
  code += `  ok: KozoResponseOk<TStatus>;\n`;
  code += `}\n\n`;

  code += `function mergeHeaders(value: unknown, extra?: Record<string, string>): Record<string, string> {\n`;
  code += `  const headers: Record<string, string> = {};\n`;
  code += `  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {\n`;
  code += `    for (const [key, item] of Object.entries(value)) {\n`;
  code += `      if (item !== undefined && item !== null) headers[key] = String(item);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `  return { ...headers, ...extra };\n`;
  code += `}\n\n`;

  code += `function materializePath(routePath: string, value: unknown): string {\n`;
  code += `  const params = value !== null && typeof value === 'object'\n`;
  code += `    ? value as Record<string, unknown>\n`;
  code += `    : {};\n`;
  code += `  const output: string[] = [];\n`;
  code += `  for (const segment of routePath.split('/').filter(Boolean)) {\n`;
  code += `    if (segment.startsWith(':')) {\n`;
  code += `      const optional = segment.endsWith('?');\n`;
  code += `      const name = segment.slice(1, optional ? -1 : undefined);\n`;
  code += `      const item = params[name];\n`;
  code += `      if (item === undefined || item === null) {\n`;
  code += `        if (optional) continue;\n`;
  code += `        throw new TypeError('Missing path parameter "' + name + '" for route ' + routePath + '.');\n`;
  code += `      }\n`;
  code += `      output.push(encodeURIComponent(String(item)));\n`;
  code += `    } else if (segment === '*') {\n`;
  code += `      const item = params.wildcard;\n`;
  code += `      if (item === undefined || item === null) {\n`;
  code += `        throw new TypeError('Missing path parameter "wildcard" for route ' + routePath + '.');\n`;
  code += `      }\n`;
  code += `      output.push(...String(item).split('/').map(part => encodeURIComponent(part)));\n`;
  code += `    } else {\n`;
  code += `      output.push(segment);\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `  return output.length > 0 ? '/' + output.join('/') : '/';\n`;
  code += `}\n\n`;

  code += `function appendQuery(path: string, value: unknown): string {\n`;
  code += `  if (value === null || typeof value !== 'object' || Array.isArray(value)) return path;\n`;
  code += `  const query = new URLSearchParams();\n`;
  code += `  for (const [key, item] of Object.entries(value)) {\n`;
  code += `    const values = Array.isArray(item) ? item : [item];\n`;
  code += `    for (const entry of values) {\n`;
  code += `      if (entry !== undefined && entry !== null) query.append(key, String(entry));\n`;
  code += `    }\n`;
  code += `  }\n`;
  code += `  const serialized = query.toString();\n`;
  code += `  return serialized ? path + '?' + serialized : path;\n`;
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

  code += `/** Thrown when the server returns a status outside the generated contract. */\n`;
  code += `export class KozoUnexpectedResponseError extends KozoApiError {\n`;
  code += `  readonly declaredStatuses: readonly number[];\n\n`;
  code += `  constructor(status: number, body: unknown, declaredStatuses: readonly number[]) {\n`;
  code += `    super(status, body);\n`;
  code += `    this.name = 'KozoUnexpectedResponseError';\n`;
  code += `    this.declaredStatuses = declaredStatuses;\n`;
  code += `    this.message = 'Unexpected API status ' + status + '; declared statuses: ' + declaredStatuses.join(', ');\n`;
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
  code += `  /** Called before an HTTP or contract response error is thrown. */\n`;
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

  code += `  /** @internal Used by the generated route-tree factory. */\n`;
  code += `  _kozoValidate(schema: { parse(value: unknown): unknown }, value: unknown): void {\n`;
  code += `    if (this.validateRequests) schema.parse(value);\n`;
  code += `  }\n\n`;

  code += `  /** @internal Used by the generated route-tree factory. */\n`;
  code += `  async _kozoRequestContract<T>(\n`;
  code += `    path: string,\n`;
  code += `    { method, body, signal, headers: extraHeaders }: { method: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> },\n`;
  code += `    declaredStatuses: readonly number[],\n`;
  code += `  ): Promise<T> {\n`;
  code += `    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;\n`;
  code += `    const headers: Record<string, string> = { ...this.defaultHeaders, ...extraHeaders };\n`;
  code += `    if (body !== undefined && headers['Content-Type'] === undefined) {\n`;
  code += `      headers['Content-Type'] = 'application/json';\n`;
  code += `    }\n`;
  code += `    const token = this.getToken ? await this.getToken() : null;\n`;
  code += `    if (token) headers['Authorization'] = 'Bearer ' + token;\n`;
  code += `    const req = { url: base + path, method, headers };\n`;
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
  code += `    const unexpected = declaredStatuses.length > 0\n`;
  code += `      ? !declaredStatuses.includes(response.status)\n`;
  code += `      : !response.ok;\n`;
  code += `    if (unexpected) {\n`;
  code += `      const error = new KozoUnexpectedResponseError(response.status, data, declaredStatuses);\n`;
  code += `      if (response.status === 401 && this.onUnauthorized) await this.onUnauthorized(error);\n`;
  code += `      if (this.onError) await this.onError(error);\n`;
  code += `      throw error;\n`;
  code += `    }\n`;
  code += `    return {\n`;
  code += `      status: response.status,\n`;
  code += `      headers: response.headers,\n`;
  code += `      body: data,\n`;
  code += `      ok: response.ok,\n`;
  code += `    } as T;\n`;
  code += `  }\n\n`;

  // Add all methods
  code += methodImplementations.join('\n');

  code += `}\n\n`;
  code += `/** Create the preferred route-tree client from the generated contract. */\n`;
  code += `export function createKozoClient(options: KozoClientOptions = {}) {\n`;
  code += `  const transport = new KozoClient(options);\n`;
  code += `  return ${routeTreeSource};\n`;
  code += `}\n\n`;
  code += `export type KozoRouteClient = ReturnType<typeof createKozoClient>;\n\n`;
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
