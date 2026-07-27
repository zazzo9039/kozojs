// src/app.ts
import { Hono } from "hono/quick";
import { serve } from "@hono/node-server";

// src/client-generator.ts
var RESERVED_CLIENT_MEMBERS = /* @__PURE__ */ new Set([
  "baseUrl",
  "constructor",
  "defaultHeaders",
  "fetchImpl",
  "getToken",
  "onError",
  "onRequest",
  "onUnauthorized",
  "request",
  "validateRequests"
]);
function identifierWords(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean);
}
function toPascalCase(value) {
  return identifierWords(value).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("");
}
function generateMethodName(method, routePath) {
  const pathName = routePath.split("/").filter(Boolean).map((segment) => {
    if (segment.startsWith(":")) {
      return `By${toPascalCase(segment.slice(1)) || "Param"}`;
    }
    return toPascalCase(segment) || "Wildcard";
  }).join("");
  const baseName = pathName ? pathName.charAt(0).toLowerCase() + pathName.slice(1) : "index";
  const safeBaseName = /^\d/.test(baseName) ? `route${baseName}` : baseName;
  const httpMethod = method.toLowerCase();
  let methodName = httpMethod === "get" ? safeBaseName : httpMethod + capitalize(safeBaseName);
  if (RESERVED_CLIENT_MEMBERS.has(methodName)) {
    methodName = `get${capitalize(methodName)}`;
  }
  return methodName;
}
function extractPathParams(path2) {
  return path2.split("/").filter((segment) => segment === "*" || segment.startsWith(":")).map((segment) => {
    if (segment === "*") return { name: "wildcard", optional: false };
    const optional = segment.endsWith("?");
    return {
      name: segment.slice(1, optional ? -1 : void 0),
      optional
    };
  });
}
function createGeneratedRouteTreeNode() {
  return {
    children: /* @__PURE__ */ new Map(),
    segmentSources: /* @__PURE__ */ new Map(),
    operations: /* @__PURE__ */ new Map()
  };
}
function normalizeClientTreeSegment(segment) {
  if (segment === "*") return "$wildcard";
  const dynamic = segment.startsWith(":");
  const source = dynamic ? segment.slice(1).replace(/\?$/, "") : segment;
  if (!/^[A-Za-z0-9._-]+$/.test(source)) {
    throw new Error(
      `[Kozo] Cannot generate client: route segment "${segment}" contains unsupported characters.`
    );
  }
  const parts = source.split(/[._-]+/).filter(Boolean);
  let normalized = parts.map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join("");
  if (!normalized) normalized = "index";
  if (/^\d/.test(normalized)) {
    normalized = `route${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }
  return dynamic ? `$${normalized}` : normalized;
}
function isZodSchema(value) {
  return value !== null && typeof value === "object" && ("_def" in value || "_zod" in value);
}
function asResponseMap(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || isZodSchema(value)) {
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  if (entries.some(([status]) => !/^\d{3}$/.test(status))) return null;
  return value;
}
function schemaAccepts(schema, value) {
  if (schema === null || typeof schema !== "object" || !("safeParse" in schema) || typeof schema.safeParse !== "function") {
    return false;
  }
  try {
    return schema.safeParse(value).success;
  } catch {
    return false;
  }
}
function generateTypedClient(routes, options = {}) {
  const {
    includeValidation = true,
    baseUrl = "",
    validateByDefault = false,
    defaultHeaders = {}
  } = options;
  const imports = [];
  const typeDefinitions = [];
  const schemaExports = [];
  const methodImplementations = [];
  const generatedRoutes = [];
  if (includeValidation) {
    imports.push(`import { z } from 'zod';`);
  }
  let code = `// Auto-generated Kozo Client
`;
  code += `// Generated at ${(/* @__PURE__ */ new Date()).toISOString()}
`;
  code += `// DO NOT EDIT - Changes will be overwritten

`;
  const schemaVars = /* @__PURE__ */ new Map();
  const methodNames = /* @__PURE__ */ new Map();
  for (const route of routes) {
    const methodName = generateMethodName(route.method, route.path);
    const conflictingRoute = methodNames.get(methodName);
    if (conflictingRoute) {
      throw new Error(
        `[Kozo] Cannot generate client: ${conflictingRoute.method.toUpperCase()} ${conflictingRoute.path} and ${route.method.toUpperCase()} ${route.path} both map to "${methodName}". Rename one route so each generated client method is unique.`
      );
    }
    methodNames.set(methodName, route);
    const pathParams = extractPathParams(route.path);
    const typeName = capitalize(methodName);
    let paramsType = "void";
    let bodyType = "void";
    let queryType = "void";
    let headersType = "void";
    let responseType = "unknown";
    let paramsSchemaName = null;
    let bodySchemaName = null;
    let querySchemaName = null;
    let headersSchemaName = null;
    let responseEntries = [];
    if (pathParams.length > 0) {
      paramsType = `{ ${pathParams.map(
        (param) => `${param.name}${param.optional ? "?" : ""}: string | number | boolean`
      ).join("; ")} }`;
    }
    if (route.zodSchemas?.params || route.schema.params) {
      paramsSchemaName = `${typeName}ParamsSchema`;
      schemaVars.set(`${methodName}_params`, paramsSchemaName);
      if (includeValidation) {
        const src = zodToString(route.zodSchemas?.params ?? route.schema.params);
        schemaExports.push(`export const ${paramsSchemaName} = ${src};`);
        const schemaType = `z.input<typeof ${paramsSchemaName}>`;
        paramsType = paramsType === "void" ? schemaType : `${schemaType} & ${paramsType}`;
      } else if (paramsType === "void") {
        paramsType = "unknown";
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
        bodyType = "unknown";
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
        queryType = "unknown";
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
        headersType = "unknown";
      }
    }
    if (route.zodSchemas?.response || route.schema.response) {
      const schemaVarName = `${typeName}ResponseSchema`;
      const raw = route.schema.response ?? route.zodSchemas?.response;
      const responseMap = asResponseMap(raw);
      if (responseMap) {
        responseEntries = Object.entries(responseMap).map(([status, schema]) => ({
          status: Number(status),
          schema,
          schemaName: includeValidation ? `${typeName}Response${status}Schema` : null,
          bodyType: includeValidation ? `z.output<typeof ${typeName}Response${status}Schema>` : "unknown"
        })).sort((left, right) => left.status - right.status);
        if (includeValidation) {
          for (const entry of responseEntries) {
            schemaExports.push(
              `export const ${entry.schemaName} = ${zodToString(entry.schema)};`
            );
          }
        }
        const successEntry = responseEntries.find((entry) => entry.status === 200) ?? responseEntries.find((entry) => entry.status >= 200 && entry.status < 300);
        if (successEntry) {
          responseType = successEntry.bodyType;
          if (includeValidation) {
            schemaExports.push(
              `/** @deprecated Use the status-specific response schemas. */
export const ${schemaVarName} = ${successEntry.schemaName};`
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
    if (bodyType !== "void" && !bodyType.includes("z.input")) {
      typeDefinitions.push(`export type ${typeName}Body = ${bodyType};`);
    }
    if (queryType !== "void" && !queryType.includes("z.input")) {
      typeDefinitions.push(`export type ${typeName}Query = ${queryType};`);
    }
    if (headersType !== "void" && !headersType.includes("z.input")) {
      typeDefinitions.push(`export type ${typeName}Headers = ${headersType};`);
    }
    if (!responseType.includes("z.output")) {
      typeDefinitions.push(`export type ${typeName}Response = ${responseType};`);
    }
    const inputFields = [];
    let inputRequired = false;
    if (paramsType !== "void") {
      inputFields.push(`  params: ${paramsType};`);
      inputRequired = true;
    }
    if (bodyType !== "void") {
      const bodySchema = route.zodSchemas?.body ?? route.schema.body;
      const optional = schemaAccepts(bodySchema, void 0);
      inputFields.push(`  body${optional ? "?" : ""}: ${bodyType};`);
      inputRequired ||= !optional;
    }
    if (queryType !== "void") {
      const querySchema = route.zodSchemas?.query ?? route.schema.query;
      const optional = schemaAccepts(querySchema, void 0) || schemaAccepts(querySchema, {});
      inputFields.push(`  query${optional ? "?" : ""}: ${queryType};`);
      inputRequired ||= !optional;
    }
    if (headersType !== "void") {
      const headersSchema = route.zodSchemas?.headers ?? route.schema.headers;
      const optional = schemaAccepts(headersSchema, void 0) || schemaAccepts(headersSchema, {});
      inputFields.push(`  headers${optional ? "?" : ""}: ${headersType};`);
      inputRequired ||= !optional;
    }
    inputFields.push("  init?: KozoRequestInit;");
    const inputType = `${typeName}Input`;
    typeDefinitions.push(
      `export interface ${inputType} {
${inputFields.join("\n")}
}`
    );
    const resultType = `${typeName}Result`;
    const resultDefinition = responseEntries.length > 0 ? responseEntries.map(
      (entry) => `KozoClientResponse<${entry.status}, ${entry.bodyType}>`
    ).join(" | ") : `KozoClientResponse<number, ${responseType}>`;
    typeDefinitions.push(`export type ${resultType} = ${resultDefinition};`);
    generatedRoutes.push({
      route,
      inputType,
      inputRequired,
      paramsType: paramsType === "void" ? null : paramsType,
      bodyType: bodyType === "void" ? null : bodyType,
      queryType: queryType === "void" ? null : queryType,
      headersType: headersType === "void" ? null : headersType,
      paramsSchemaName,
      bodySchemaName,
      querySchemaName,
      headersSchemaName,
      resultType,
      declaredStatuses: responseEntries.map((entry) => entry.status)
    });
    const args = [];
    if (paramsType !== "void") args.push(`params: ${paramsType}`);
    if (bodyType !== "void") args.push(`body: ${bodyType}`);
    if (queryType !== "void") {
      args.push(headersType !== "void" ? `query: ${queryType} | undefined` : `query?: ${queryType}`);
    }
    if (headersType !== "void") args.push(`headers: ${headersType}`);
    args.push("init?: KozoRequestInit");
    const argsStr = args.join(", ");
    const returnType = `Promise<${responseType}>`;
    const routeSegments = route.path.split("/").filter(Boolean).map(normalizeClientTreeSegment);
    const routeTreePath = [
      "api",
      ...routeSegments,
      route.method.toLowerCase()
    ].join(".");
    let methodBody = `  /** @deprecated Use ${routeTreePath}({ ... }) from createKozoClient(). */
  async ${methodName}(${argsStr}): ${returnType} {
`;
    if (includeValidation && paramsType !== "void") {
      const schemaVar = schemaVars.get(`${methodName}_params`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(params);
`;
      }
    }
    if (includeValidation && bodyType !== "void") {
      const schemaVar = schemaVars.get(`${methodName}_body`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(body);
`;
      }
    }
    if (includeValidation && queryType !== "void") {
      const schemaVar = schemaVars.get(`${methodName}_query`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(query ?? {});
`;
      }
    }
    if (includeValidation && headersType !== "void") {
      const schemaVar = schemaVars.get(`${methodName}_headers`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests) ${schemaVar}.parse(headers ?? {});
`;
      }
    }
    let urlExpression = `\`\${this.baseUrl}${route.path}\``;
    if (pathParams.length > 0) {
      urlExpression = `this.baseUrl + materializePath(${JSON.stringify(route.path)}, params)`;
    }
    methodBody += `    let url = ${urlExpression};
`;
    if (queryType !== "void") {
      methodBody += `    if (query) {
`;
      methodBody += `      const qs = new URLSearchParams();
`;
      methodBody += `      for (const [k, v] of Object.entries(query)) {
`;
      methodBody += `        if (Array.isArray(v)) {
`;
      methodBody += `          for (const item of v) {
`;
      methodBody += `            if (item !== undefined && item !== null) qs.append(k, String(item));
`;
      methodBody += `          }
`;
      methodBody += `        } else if (v !== undefined && v !== null) {
`;
      methodBody += `          qs.append(k, String(v));
`;
      methodBody += `        }
`;
      methodBody += `      }
`;
      methodBody += `      const queryString = qs.toString();
`;
      methodBody += `      if (queryString) url += \`?\${queryString}\`;
`;
      methodBody += `    }
`;
    }
    const requestArgs = [`method: '${route.method.toUpperCase()}'`];
    if (bodyType !== "void") requestArgs.push("body");
    requestArgs.push(
      "signal: init?.signal",
      headersType !== "void" ? "headers: mergeHeaders(headers, init?.headers)" : "headers: init?.headers"
    );
    methodBody += `    return this.request(url, { ${requestArgs.join(", ")} });
`;
    methodBody += `  }
`;
    methodImplementations.push(methodBody);
  }
  const routeTree = createGeneratedRouteTreeNode();
  for (const generated of generatedRoutes) {
    const pathSegments = generated.route.path.split("/").filter(Boolean);
    let node = routeTree;
    for (const source of pathSegments) {
      const key = normalizeClientTreeSegment(source);
      const previousSource = node.segmentSources.get(key);
      if (previousSource !== void 0 && previousSource !== source) {
        throw new Error(
          `[Kozo] Cannot generate client: route segments "${previousSource}" and "${source}" both normalize to "${key}".`
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
        `[Kozo] Cannot generate client: duplicate operation ${generated.route.method.toUpperCase()} ${generated.route.path}.`
      );
    }
    node.operations.set(method, generated);
  }
  const renderOperation = (generated, indent) => {
    const { route } = generated;
    const inputDefault = generated.inputRequired ? "" : " = {}";
    let source = `async (input: ${generated.inputType}${inputDefault}): Promise<${generated.resultType}> => {
`;
    if (includeValidation) {
      if (generated.paramsSchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.paramsSchemaName}, input.params);
`;
      }
      if (generated.bodySchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.bodySchemaName}, input.body);
`;
      }
      if (generated.querySchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.querySchemaName}, input.query ?? {});
`;
      }
      if (generated.headersSchemaName) {
        source += `${indent}  transport._kozoValidate(${generated.headersSchemaName}, input.headers ?? {});
`;
      }
    }
    source += `${indent}  let path = materializePath(${JSON.stringify(route.path)}, ${generated.paramsType ? "input.params" : "undefined"});
`;
    if (generated.queryType) {
      source += `${indent}  path = appendQuery(path, input.query);
`;
    }
    const requestArgs = [`method: '${route.method.toUpperCase()}'`];
    if (generated.bodyType) requestArgs.push("body: input.body");
    requestArgs.push(
      "signal: input.init?.signal",
      generated.headersType ? "headers: mergeHeaders(input.headers, input.init?.headers)" : "headers: input.init?.headers"
    );
    source += `${indent}  return transport._kozoRequestContract<${generated.resultType}>(
${indent}    path,
${indent}    { ${requestArgs.join(", ")} },
${indent}    ${JSON.stringify(generated.declaredStatuses)},
${indent}  );
${indent}}`;
    return source;
  };
  const renderTreeNode = (node, indent) => {
    const keys = [
      .../* @__PURE__ */ new Set([
        ...node.children.keys(),
        ...node.operations.keys()
      ])
    ];
    if (keys.length === 0) return "{}";
    const properties = keys.map((key) => {
      const child = node.children.get(key);
      const operation = node.operations.get(key);
      let value;
      if (operation && child) {
        value = `Object.assign(
${indent}  ${renderOperation(operation, `${indent}  `)},
${indent}  ${renderTreeNode(child, `${indent}  `)},
${indent})`;
      } else if (operation) {
        value = renderOperation(operation, indent);
      } else {
        value = renderTreeNode(child, `${indent}  `);
      }
      return `${indent}${JSON.stringify(key)}: ${value}`;
    });
    return `{
${properties.join(",\n")}
${indent.slice(2)}}`;
  };
  const routeTreeSource = renderTreeNode(routeTree, "    ");
  if (imports.length > 0) {
    code += imports.join("\n") + "\n\n";
  }
  if (typeDefinitions.length > 0) {
    code += "// Type Definitions\n";
    code += typeDefinitions.join("\n") + "\n\n";
  }
  if (includeValidation && schemaExports.length > 0) {
    code += "// Zod Schemas\n";
    code += schemaExports.join("\n") + "\n\n";
  }
  code += `/** Per-request overrides accepted by every client method. */
`;
  code += `export interface KozoRequestInit {
`;
  code += `  signal?: AbortSignal;
`;
  code += `  headers?: Record<string, string>;
`;
  code += `}

`;
  code += `export type KozoResponseOk<TStatus extends number> =
`;
  code += `  number extends TStatus ? boolean :
`;
  code += `  \`\${TStatus}\` extends \`2\${string}\` ? true : false;

`;
  code += `/** A status-discriminated response returned by the route-tree client. */
`;
  code += `export interface KozoClientResponse<TStatus extends number, TBody> {
`;
  code += `  status: TStatus;
`;
  code += `  headers: Headers;
`;
  code += `  body: TBody;
`;
  code += `  ok: KozoResponseOk<TStatus>;
`;
  code += `}

`;
  code += `function mergeHeaders(value: unknown, extra?: Record<string, string>): Record<string, string> {
`;
  code += `  const headers: Record<string, string> = {};
`;
  code += `  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
`;
  code += `    for (const [key, item] of Object.entries(value)) {
`;
  code += `      if (item !== undefined && item !== null) headers[key] = String(item);
`;
  code += `    }
`;
  code += `  }
`;
  code += `  return { ...headers, ...extra };
`;
  code += `}

`;
  code += `function materializePath(routePath: string, value: unknown): string {
`;
  code += `  const params = value !== null && typeof value === 'object'
`;
  code += `    ? value as Record<string, unknown>
`;
  code += `    : {};
`;
  code += `  const output: string[] = [];
`;
  code += `  for (const segment of routePath.split('/').filter(Boolean)) {
`;
  code += `    if (segment.startsWith(':')) {
`;
  code += `      const optional = segment.endsWith('?');
`;
  code += `      const name = segment.slice(1, optional ? -1 : undefined);
`;
  code += `      const item = params[name];
`;
  code += `      if (item === undefined || item === null) {
`;
  code += `        if (optional) continue;
`;
  code += `        throw new TypeError('Missing path parameter "' + name + '" for route ' + routePath + '.');
`;
  code += `      }
`;
  code += `      output.push(encodeURIComponent(String(item)));
`;
  code += `    } else if (segment === '*') {
`;
  code += `      const item = params.wildcard;
`;
  code += `      if (item === undefined || item === null) {
`;
  code += `        throw new TypeError('Missing path parameter "wildcard" for route ' + routePath + '.');
`;
  code += `      }
`;
  code += `      output.push(...String(item).split('/').map(part => encodeURIComponent(part)));
`;
  code += `    } else {
`;
  code += `      output.push(segment);
`;
  code += `    }
`;
  code += `  }
`;
  code += `  return output.length > 0 ? '/' + output.join('/') : '/';
`;
  code += `}

`;
  code += `function appendQuery(path: string, value: unknown): string {
`;
  code += `  if (value === null || typeof value !== 'object' || Array.isArray(value)) return path;
`;
  code += `  const query = new URLSearchParams();
`;
  code += `  for (const [key, item] of Object.entries(value)) {
`;
  code += `    const values = Array.isArray(item) ? item : [item];
`;
  code += `    for (const entry of values) {
`;
  code += `      if (entry !== undefined && entry !== null) query.append(key, String(entry));
`;
  code += `    }
`;
  code += `  }
`;
  code += `  const serialized = query.toString();
`;
  code += `  return serialized ? path + '?' + serialized : path;
`;
  code += `}

`;
  code += `/** RFC 7807 problem details (application/problem+json). */
`;
  code += `export interface KozoProblemDetails {
`;
  code += `  type?: string;
`;
  code += `  title?: string;
`;
  code += `  status?: number;
`;
  code += `  detail?: string;
`;
  code += `  instance?: string;
`;
  code += `  [key: string]: unknown;
`;
  code += `}

`;
  code += `/** Thrown on every non-2xx response. Carries the parsed body and RFC 7807 fields. */
`;
  code += `export class KozoApiError extends Error {
`;
  code += `  readonly status: number;
`;
  code += `  readonly problem: KozoProblemDetails | null;
`;
  code += `  readonly body: unknown;

`;
  code += `  constructor(status: number, body: unknown) {
`;
  code += `    const problem = body !== null && typeof body === 'object' && !Array.isArray(body)
`;
  code += `      ? (body as KozoProblemDetails)
`;
  code += `      : null;
`;
  code += `    const title = problem && typeof problem.title === 'string' ? problem.title : null;
`;
  code += `    const message = problem && typeof (problem as { message?: unknown }).message === 'string'
`;
  code += `      ? (problem as { message: string }).message
`;
  code += `      : null;
`;
  code += `    super(title ?? message ?? 'API error ' + status);
`;
  code += `    this.name = 'KozoApiError';
`;
  code += `    this.status = status;
`;
  code += `    this.problem = problem;
`;
  code += `    this.body = body;
`;
  code += `  }
`;
  code += `}

`;
  code += `/** Thrown when the server returns a status outside the generated contract. */
`;
  code += `export class KozoUnexpectedResponseError extends KozoApiError {
`;
  code += `  readonly declaredStatuses: readonly number[];

`;
  code += `  constructor(status: number, body: unknown, declaredStatuses: readonly number[]) {
`;
  code += `    super(status, body);
`;
  code += `    this.name = 'KozoUnexpectedResponseError';
`;
  code += `    this.declaredStatuses = declaredStatuses;
`;
  code += `    this.message = 'Unexpected API status ' + status + '; declared statuses: ' + declaredStatuses.join(', ');
`;
  code += `  }
`;
  code += `}

`;
  code += `export interface KozoClientOptions {
`;
  code += `  baseUrl?: string;
`;
  code += `  validateRequests?: boolean;
`;
  code += `  defaultHeaders?: Record<string, string>;
`;
  code += `  /** Bearer token provider, called per request; skipped when it returns null/undefined. */
`;
  code += `  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
`;
  code += `  /** Inspect/mutate url and headers right before the request is sent. */
`;
  code += `  onRequest?: (req: { url: string; method: string; headers: Record<string, string> }) => void | Promise<void>;
`;
  code += `  /** Called on 401 responses when a request was sent (e.g. clear session, redirect to login). */
`;
  code += `  onUnauthorized?: (error: KozoApiError) => void | Promise<void>;
`;
  code += `  /** Called before an HTTP or contract response error is thrown. */
`;
  code += `  onError?: (error: KozoApiError) => void | Promise<void>;
`;
  code += `  /** Custom fetch implementation (default: globalThis.fetch). */
`;
  code += `  fetch?: typeof fetch;
`;
  code += `}

`;
  code += `export class KozoClient {
`;
  code += `  private baseUrl: string;
`;
  code += `  private validateRequests: boolean;
`;
  code += `  private defaultHeaders: Record<string, string>;
`;
  code += `  private getToken?: KozoClientOptions['getToken'];
`;
  code += `  private onRequest?: KozoClientOptions['onRequest'];
`;
  code += `  private onUnauthorized?: KozoClientOptions['onUnauthorized'];
`;
  code += `  private onError?: KozoClientOptions['onError'];
`;
  code += `  private fetchImpl: typeof fetch;

`;
  code += `  constructor(options: KozoClientOptions = {}) {
`;
  code += `    this.baseUrl = options.baseUrl || '${baseUrl}';
`;
  code += `    this.validateRequests = options.validateRequests ?? ${validateByDefault};
`;
  code += `    this.defaultHeaders = options.defaultHeaders || ${JSON.stringify(defaultHeaders)};
`;
  code += `    this.getToken = options.getToken;
`;
  code += `    this.onRequest = options.onRequest;
`;
  code += `    this.onUnauthorized = options.onUnauthorized;
`;
  code += `    this.onError = options.onError;
`;
  code += `    this.fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
`;
  code += `  }

`;
  code += `  /** Shared transport: bearer auth, request hook, 204/non-JSON handling, RFC 7807 errors. */
`;
  code += `  protected async request<T>(
`;
  code += `    url: string,
`;
  code += `    { method, body, signal, headers: extraHeaders }: { method: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> },
`;
  code += `  ): Promise<T> {
`;
  code += `    const headers: Record<string, string> = { ...this.defaultHeaders, ...extraHeaders };
`;
  code += `    if (body !== undefined && headers['Content-Type'] === undefined) {
`;
  code += `      headers['Content-Type'] = 'application/json';
`;
  code += `    }
`;
  code += `    const token = this.getToken ? await this.getToken() : null;
`;
  code += `    if (token) headers['Authorization'] = 'Bearer ' + token;
`;
  code += `    const req = { url, method, headers };
`;
  code += `    if (this.onRequest) await this.onRequest(req);
`;
  code += `    const response = await this.fetchImpl(req.url, {
`;
  code += `      method,
`;
  code += `      headers: req.headers,
`;
  code += `      body: body !== undefined ? JSON.stringify(body) : undefined,
`;
  code += `      signal,
`;
  code += `    });
`;
  code += `    const contentType = response.headers.get('content-type') ?? '';
`;
  code += `    const data = response.status === 204
`;
  code += `      ? null
`;
  code += `      : contentType.includes('json')
`;
  code += `        ? await response.json().catch(() => null)
`;
  code += `        : await response.text();
`;
  code += `    if (!response.ok) {
`;
  code += `      const error = new KozoApiError(response.status, data);
`;
  code += `      if (response.status === 401 && this.onUnauthorized) await this.onUnauthorized(error);
`;
  code += `      if (this.onError) await this.onError(error);
`;
  code += `      throw error;
`;
  code += `    }
`;
  code += `    return data as T;
`;
  code += `  }

`;
  code += `  /** @internal Used by the generated route-tree factory. */
`;
  code += `  _kozoValidate(schema: { parse(value: unknown): unknown }, value: unknown): void {
`;
  code += `    if (this.validateRequests) schema.parse(value);
`;
  code += `  }

`;
  code += `  /** @internal Used by the generated route-tree factory. */
`;
  code += `  async _kozoRequestContract<T>(
`;
  code += `    path: string,
`;
  code += `    { method, body, signal, headers: extraHeaders }: { method: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> },
`;
  code += `    declaredStatuses: readonly number[],
`;
  code += `  ): Promise<T> {
`;
  code += `    const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
`;
  code += `    const headers: Record<string, string> = { ...this.defaultHeaders, ...extraHeaders };
`;
  code += `    if (body !== undefined && headers['Content-Type'] === undefined) {
`;
  code += `      headers['Content-Type'] = 'application/json';
`;
  code += `    }
`;
  code += `    const token = this.getToken ? await this.getToken() : null;
`;
  code += `    if (token) headers['Authorization'] = 'Bearer ' + token;
`;
  code += `    const req = { url: base + path, method, headers };
`;
  code += `    if (this.onRequest) await this.onRequest(req);
`;
  code += `    const response = await this.fetchImpl(req.url, {
`;
  code += `      method,
`;
  code += `      headers: req.headers,
`;
  code += `      body: body !== undefined ? JSON.stringify(body) : undefined,
`;
  code += `      signal,
`;
  code += `    });
`;
  code += `    const contentType = response.headers.get('content-type') ?? '';
`;
  code += `    const data = response.status === 204
`;
  code += `      ? null
`;
  code += `      : contentType.includes('json')
`;
  code += `        ? await response.json().catch(() => null)
`;
  code += `        : await response.text();
`;
  code += `    const unexpected = declaredStatuses.length > 0
`;
  code += `      ? !declaredStatuses.includes(response.status)
`;
  code += `      : !response.ok;
`;
  code += `    if (unexpected) {
`;
  code += `      const error = new KozoUnexpectedResponseError(response.status, data, declaredStatuses);
`;
  code += `      if (response.status === 401 && this.onUnauthorized) await this.onUnauthorized(error);
`;
  code += `      if (this.onError) await this.onError(error);
`;
  code += `      throw error;
`;
  code += `    }
`;
  code += `    return {
`;
  code += `      status: response.status,
`;
  code += `      headers: response.headers,
`;
  code += `      body: data,
`;
  code += `      ok: response.ok,
`;
  code += `    } as T;
`;
  code += `  }

`;
  code += methodImplementations.join("\n");
  code += `}

`;
  code += `/** Create the preferred route-tree client from the generated contract. */
`;
  code += `export function createKozoClient(options: KozoClientOptions = {}) {
`;
  code += `  const transport = new KozoClient(options);
`;
  code += `  return ${routeTreeSource};
`;
  code += `}

`;
  code += `export type KozoRouteClient = ReturnType<typeof createKozoClient>;

`;
  code += `export default KozoClient;
`;
  return code;
}
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function zodToString(schema) {
  const def4 = schema?._zod?.def;
  const def3 = schema?._def;
  const tn = def4?.type ?? def3?.typeName?.replace(/^Zod/, "").toLowerCase();
  if (!tn) {
    console.warn("[Kozo] zodToString: received schema with no detectable type \u2014 falling back to z.any()");
    return "z.any()";
  }
  switch (tn) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "date":
      return "z.date()";
    case "undefined":
      return "z.undefined()";
    case "null":
      return "z.null()";
    case "any":
      return "z.any()";
    case "unknown":
      return "z.unknown()";
    case "void":
      return "z.void()";
    case "literal": {
      const val = def4?.values?.[0] ?? def3?.value;
      return `z.literal(${JSON.stringify(val)})`;
    }
    case "enum": {
      const entries = def4?.entries ?? def3?.values;
      const vals = Array.isArray(entries) ? entries : Object.values(entries ?? {});
      return `z.enum(${JSON.stringify(vals)})`;
    }
    case "nativeenum":
      console.warn("[Kozo] zodToString: z.nativeEnum() cannot be serialized to source code \u2014 falling back to z.any()");
      return "z.any()";
    case "array": {
      const inner = def4?.element ?? def3?.type;
      return `z.array(${zodToString(inner)})`;
    }
    case "object": {
      const shape = def4?.shape ?? (typeof def3?.shape === "function" ? def3.shape() : def3?.shape);
      if (!shape) return "z.object({})";
      const props = Object.entries(shape).map(([k, v]) => `${k}: ${zodToString(v)}`).join(", ");
      return `z.object({ ${props} })`;
    }
    case "optional": {
      const inner = def4?.innerType ?? def3?.innerType;
      return `${zodToString(inner)}.optional()`;
    }
    case "nullable": {
      const inner = def4?.innerType ?? def3?.innerType;
      return `${zodToString(inner)}.nullable()`;
    }
    case "default": {
      const inner = def4?.innerType ?? def3?.innerType;
      const dv = def4?.defaultValue ?? def3?.defaultValue?.();
      return `${zodToString(inner)}.default(${JSON.stringify(dv)})`;
    }
    case "union": {
      const opts = def4?.options ?? def3?.options ?? [];
      return `z.union([${opts.map(zodToString).join(", ")}])`;
    }
    case "intersection": {
      const left = def4?.left ?? def3?.left;
      const right = def4?.right ?? def3?.right;
      return `z.intersection(${zodToString(left)}, ${zodToString(right)})`;
    }
    case "record": {
      const kt = def4?.keyType ?? def3?.keyType;
      const vt = def4?.valueType ?? def3?.valueType;
      return `z.record(${kt ? zodToString(kt) : "z.string()"}, ${zodToString(vt)})`;
    }
    case "tuple": {
      const items = def4?.items ?? def3?.items ?? [];
      return `z.tuple([${items.map(zodToString).join(", ")}])`;
    }
    case "effects":
      return zodToString(def3?.schema);
    case "pipeline":
      return zodToString(def3?.in ?? def4?.in);
    default:
      console.warn(`[Kozo] zodToString: unsupported Zod type "${tn}" \u2014 falling back to z.any()`);
      return "z.any()";
  }
}

// src/uws-transport.ts
import { createServer as netCreateServer } from "net";

// src/body-read.ts
var UTF8_DECODER = new TextDecoder();
function chunksToUtf8(chunks) {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0].toString("utf8");
  return Buffer.concat(chunks).toString("utf8");
}

// src/errors.ts
var CONTENT_TYPE_PROBLEM = "application/problem+json";
var ERROR_RESPONSES = {
  VALIDATION_FAILED: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#validation-failed",
    title: "Validation Failed",
    status: 400
  },
  INVALID_BODY: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#invalid-body",
    title: "Invalid Request Body",
    status: 400
  },
  INVALID_QUERY: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#invalid-query",
    title: "Invalid Query Parameters",
    status: 400
  },
  INVALID_PARAMS: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#invalid-params",
    title: "Invalid Path Parameters",
    status: 400
  },
  INTERNAL_ERROR: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#internal-error",
    title: "Internal Server Error",
    status: 500
  },
  NOT_FOUND: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#not-found",
    title: "Resource Not Found",
    status: 404
  },
  UNAUTHORIZED: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#unauthorized",
    title: "Unauthorized",
    status: 401
  },
  FORBIDDEN: {
    type: "https://kozo-docs.vercel.app/docs/core/errors#forbidden",
    title: "Forbidden",
    status: 403
  }
};
var HDR_PROBLEM = new Headers({ "Content-Type": CONTENT_TYPE_PROBLEM });
var INIT_400 = { status: 400, headers: HDR_PROBLEM };
var INIT_401 = { status: 401, headers: HDR_PROBLEM };
var INIT_403 = { status: 403, headers: HDR_PROBLEM };
var INIT_404 = { status: 404, headers: HDR_PROBLEM };
var INIT_500 = { status: 500, headers: HDR_PROBLEM };
function formatValidationErrors(errors) {
  if (!errors || errors.length === 0) return [];
  return errors.map((err) => ({
    field: err.instancePath?.replace(/^\//, "").replace(/\//g, ".") || err.params?.missingProperty || "unknown",
    path: err.path,
    message: err.message || "Invalid value",
    code: err.keyword || "invalid",
    value: err.data
  }));
}
function formatZodErrors(errors) {
  if (!errors?.issues) return [];
  return errors.issues.map((issue) => ({
    field: issue.path?.join(".") || "unknown",
    message: issue.message || "Invalid value",
    code: issue.code || "invalid",
    value: issue.input
  }));
}
function validationErrorResponse(field, ajvErrors, instance) {
  const body = {
    type: ERROR_RESPONSES.VALIDATION_FAILED.type,
    title: ERROR_RESPONSES.VALIDATION_FAILED.title,
    status: 400,
    errors: formatValidationErrors(ajvErrors)
  };
  if (instance) body.instance = instance;
  return new Response(JSON.stringify(body), INIT_400);
}
function internalErrorResponse(err, instance) {
  const body = {
    type: ERROR_RESPONSES.INTERNAL_ERROR.type,
    title: ERROR_RESPONSES.INTERNAL_ERROR.title,
    status: 500,
    // Only expose error message in development to avoid leaking sensitive info
    ...process.env.NODE_ENV !== "production" && err?.message ? { detail: err.message } : {}
  };
  if (instance) body.instance = instance;
  return new Response(JSON.stringify(body), INIT_500);
}
var BODY_404_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.NOT_FOUND.type,
  title: ERROR_RESPONSES.NOT_FOUND.title,
  status: 404
});
function notFoundResponse(instance) {
  if (!instance) return new Response(BODY_404_STATIC, INIT_404);
  const body = {
    type: ERROR_RESPONSES.NOT_FOUND.type,
    title: ERROR_RESPONSES.NOT_FOUND.title,
    status: 404,
    instance
  };
  return new Response(JSON.stringify(body), INIT_404);
}
var BODY_401_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.UNAUTHORIZED.type,
  title: ERROR_RESPONSES.UNAUTHORIZED.title,
  status: 401
});
function unauthorizedResponse(instance) {
  if (!instance) return new Response(BODY_401_STATIC, INIT_401);
  const body = {
    type: ERROR_RESPONSES.UNAUTHORIZED.type,
    title: ERROR_RESPONSES.UNAUTHORIZED.title,
    status: 401,
    instance
  };
  return new Response(JSON.stringify(body), INIT_401);
}
var BODY_403_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.FORBIDDEN.type,
  title: ERROR_RESPONSES.FORBIDDEN.title,
  status: 403
});
function forbiddenResponse(instance) {
  if (!instance) return new Response(BODY_403_STATIC, INIT_403);
  const body = {
    type: ERROR_RESPONSES.FORBIDDEN.type,
    title: ERROR_RESPONSES.FORBIDDEN.title,
    status: 403,
    instance
  };
  return new Response(JSON.stringify(body), INIT_403);
}
var BODY_500_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.INTERNAL_ERROR.type,
  title: ERROR_RESPONSES.INTERNAL_ERROR.title,
  status: 500
});
function bodyTooLargeJson(maxBytes) {
  return JSON.stringify({
    type: "about:blank",
    title: "Content Too Large",
    status: 413,
    detail: `Request body exceeds the ${maxBytes}-byte limit`
  });
}
var KozoError = class extends Error {
  statusCode;
  code;
  constructor(message, statusCode, code) {
    super(message);
    this.name = "KozoError";
    this.statusCode = statusCode;
    this.code = code;
  }
  toResponse(instance) {
    const body = {
      type: `https://kozo-docs.vercel.app/docs/core/errors#${this.code}`,
      title: this.message,
      status: this.statusCode
    };
    if (instance) body.instance = instance;
    const init = _initForStatus(this.statusCode);
    return new Response(JSON.stringify(body), init);
  }
};
function _initForStatus(status) {
  if (status === 400) return INIT_400;
  if (status === 401) return INIT_401;
  if (status === 403) return INIT_403;
  if (status === 404) return INIT_404;
  if (status === 500) return INIT_500;
  return { status, headers: new Headers({ "Content-Type": CONTENT_TYPE_PROBLEM }) };
}
var ValidationFailedError = class extends KozoError {
  errors;
  constructor(message, errors = []) {
    super(message, 400, "validation-failed");
    this.name = "ValidationFailedError";
    this.errors = errors;
  }
  toResponse(instance) {
    const body = {
      type: "https://kozo-docs.vercel.app/docs/core/errors#validation-failed",
      title: this.message,
      status: 400,
      errors: this.errors
    };
    if (instance) body.instance = instance;
    return new Response(JSON.stringify(body), INIT_400);
  }
};
var NotFoundError = class extends KozoError {
  constructor(message = "Resource Not Found") {
    super(message, 404, "not-found");
    this.name = "NotFoundError";
  }
};
var UnauthorizedError = class extends KozoError {
  constructor(message = "Unauthorized") {
    super(message, 401, "unauthorized");
    this.name = "UnauthorizedError";
  }
};
var ForbiddenError = class extends KozoError {
  constructor(message = "Forbidden") {
    super(message, 403, "forbidden");
    this.name = "ForbiddenError";
  }
};
var ConflictError = class extends KozoError {
  constructor(message = "Conflict") {
    super(message, 409, "conflict");
    this.name = "ConflictError";
  }
};
var GoneError = class extends KozoError {
  constructor(message = "Gone") {
    super(message, 410, "gone");
    this.name = "GoneError";
  }
};
var BadRequestError = class extends KozoError {
  constructor(message = "Bad Request") {
    super(message, 400, "bad-request");
    this.name = "BadRequestError";
  }
};

// src/uws-transport.ts
function decodeRouteParameter(value) {
  if (value.indexOf("%") === -1) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
var STATUS_TEXT = {
  200: "200 OK",
  201: "201 Created",
  204: "204 No Content",
  301: "301 Moved Permanently",
  302: "302 Found",
  400: "400 Bad Request",
  401: "401 Unauthorized",
  403: "403 Forbidden",
  404: "404 Not Found",
  405: "405 Method Not Allowed",
  422: "422 Unprocessable Entity",
  429: "429 Too Many Requests",
  500: "500 Internal Server Error",
  503: "503 Service Unavailable"
};
var BODY_404 = JSON.stringify({
  type: "https://kozo-docs.vercel.app/docs/core/errors#not-found",
  title: "Resource Not Found",
  status: 404
});
var NO_BODY_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "DELETE", "OPTIONS", "TRACE"]);
var CT_JSON = "application/json";
var CT_PROBLEM = "application/problem+json";
var BODY_500 = JSON.stringify({
  type: "https://kozo-docs.vercel.app/docs/core/errors#internal-error",
  title: "Internal Server Error",
  status: 500
});
var BODY_503 = JSON.stringify({
  type: "about:blank",
  title: "Service Unavailable",
  status: 503,
  detail: "Server is shutting down, please retry later"
});
var DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;
var uwsAborted = /* @__PURE__ */ new WeakMap();
var uwsFinished = /* @__PURE__ */ new WeakMap();
function isUwsAborted(uwsRes) {
  return uwsAborted.get(uwsRes) === true;
}
function canWriteUws(uwsRes) {
  return !isUwsAborted(uwsRes) && uwsFinished.get(uwsRes) !== true;
}
function markUwsFinished(uwsRes) {
  uwsFinished.set(uwsRes, true);
}
function uwsSafeEnd(uwsRes, body) {
  markUwsFinished(uwsRes);
  try {
    if (body === void 0) uwsRes.end();
    else uwsRes.end(body);
  } catch {
  }
}
function uwsCorkWrite(uwsRes, fn) {
  if (!canWriteUws(uwsRes)) return;
  try {
    uwsRes.cork(() => {
      if (!canWriteUws(uwsRes)) return;
      try {
        fn();
      } catch {
        markUwsFinished(uwsRes);
      }
    });
  } catch {
    markUwsFinished(uwsRes);
  }
}
function uwsCorkRespond(uwsRes, fn) {
  uwsCorkWrite(uwsRes, fn);
}
function uwsFastWriteJson(uwsRes, body, corsHeaders) {
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus("200 OK");
    uwsRes.writeHeader("Content-Type", CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, body);
  });
}
function uwsFastWriteJsonStatus(uwsRes, body, status, corsHeaders) {
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus(STATUS_TEXT[status] ?? `${status}`);
    uwsRes.writeHeader("Content-Type", CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, body);
  });
}
function uwsFastWrite400(field, errors, uwsRes, corsHeaders) {
  const body = JSON.stringify({
    type: "https://kozo-docs.vercel.app/docs/core/errors#validation-failed",
    title: "Validation Failed",
    status: 400,
    errors: (errors ?? []).map((e) => ({
      field: e.instancePath?.replace(/^\//, "").replace(/\//g, ".") || e.params?.missingProperty || "unknown",
      message: e.message || "Invalid value",
      code: e.keyword || "invalid"
    }))
  });
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus("400 Bad Request");
    uwsRes.writeHeader("Content-Type", CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, body);
  });
}
function uwsFastWrite500(uwsRes, corsHeaders) {
  uwsCorkWrite(uwsRes, () => {
    uwsRes.writeStatus("500 Internal Server Error");
    uwsRes.writeHeader("Content-Type", CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsSafeEnd(uwsRes, BODY_500);
  });
}
function uwsFastWriteError(err, uwsRes, corsHeaders) {
  if (!canWriteUws(uwsRes)) return;
  if (err instanceof KozoError) {
    const body = JSON.stringify({
      type: `https://kozo-docs.vercel.app/docs/core/errors#${err.code}`,
      title: err.message,
      status: err.statusCode
    });
    uwsCorkWrite(uwsRes, () => {
      uwsRes.writeStatus(STATUS_TEXT[err.statusCode] ?? `${err.statusCode}`);
      uwsRes.writeHeader("Content-Type", CT_PROBLEM);
      if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
      uwsSafeEnd(uwsRes, body);
    });
  } else {
    uwsFastWrite500(uwsRes, corsHeaders);
  }
}
async function tryLoadUws() {
  const { createRequire: createRequire2 } = await import("module");
  try {
    const req = createRequire2(import.meta.url);
    return req("uWebSockets.js");
  } catch {
  }
  try {
    const req = createRequire2(new URL(`file://${process.cwd()}/index.js`));
    return req("uWebSockets.js");
  } catch {
    return null;
  }
}
function readUwsRemoteAddress(uwsRes) {
  try {
    return UTF8_DECODER.decode(uwsRes.getRemoteAddressAsText());
  } catch {
    return "";
  }
}
function middlewarePatternOverlaps(pattern, routePath) {
  if (pattern === "*" || pattern === "/*") return true;
  const p = pattern.split("/").filter(Boolean);
  const r = routePath.split("/").filter(Boolean);
  for (let i = 0; i < p.length; i++) {
    const ps = p[i];
    if (ps === "*") return true;
    const rs = r[i];
    if (rs === void 0) return false;
    if (ps.startsWith(":") || rs.startsWith(":")) continue;
    if (ps !== rs) return false;
  }
  return p.length === r.length;
}
function writeFetchHeadersToUws(uwsRes, responseHeaders) {
  const setCookies = typeof responseHeaders.getSetCookie === "function" ? responseHeaders.getSetCookie() : [];
  responseHeaders.forEach((v, k) => {
    const lower = k.toLowerCase();
    if (lower === "content-length" || lower === "set-cookie") return;
    uwsRes.writeHeader(k, v);
  });
  if (setCookies.length > 0) {
    for (const cookie of setCookies) uwsRes.writeHeader("Set-Cookie", cookie);
    return;
  }
  const legacy = responseHeaders.get("set-cookie");
  if (legacy) uwsRes.writeHeader("Set-Cookie", legacy);
}
function makeUwsHonoBridge(method, honoFetch) {
  const canHaveBody = !NO_BODY_METHODS.has(method);
  return async (uwsRes, url, rawBody, _params, corsHeaders, reqHeaders) => {
    try {
      const headers = new Headers();
      if (reqHeaders) for (const k in reqHeaders) headers.set(k, reqHeaders[k]);
      const request = new Request(`http://kozo.uws${url}`, {
        method,
        headers,
        body: canHaveBody && rawBody.length > 0 ? rawBody : void 0
      });
      const response = await honoFetch(request);
      const body = response.status === 204 || response.status === 304 ? void 0 : await response.text();
      uwsCorkWrite(uwsRes, () => {
        uwsRes.writeStatus(STATUS_TEXT[response.status] ?? String(response.status));
        writeFetchHeadersToUws(uwsRes, response.headers);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, body);
      });
    } catch {
      uwsFastWrite500(uwsRes, corsHeaders);
    }
  };
}
function getFreePort() {
  return new Promise((resolve2, reject) => {
    const srv = netCreateServer();
    srv.listen(0, "0.0.0.0", () => {
      const port = srv.address().port;
      srv.close((err) => err ? reject(err) : resolve2(port));
    });
  });
}
var UWS_METHOD = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "del",
  OPTIONS: "options",
  HEAD: "head"
};
function buildCorsHeadersFor(cfg, origin) {
  const h = [
    ["Access-Control-Allow-Origin", origin],
    ["Access-Control-Allow-Methods", cfg.methods ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS"],
    ["Access-Control-Allow-Headers", cfg.headers ?? "Content-Type,Authorization"]
  ];
  if (Array.isArray(cfg.origin)) h.push(["Vary", "Origin"]);
  if (cfg.maxAge != null) h.push(["Access-Control-Max-Age", String(cfg.maxAge)]);
  if (cfg.credentials) h.push(["Access-Control-Allow-Credentials", "true"]);
  return h;
}
function makeCorsResolver(cfg) {
  const allowed = cfg.origin;
  const cache = /* @__PURE__ */ new Map();
  return (origin) => {
    if (!origin || !allowed.includes(origin)) return void 0;
    let h = cache.get(origin);
    if (!h) {
      h = buildCorsHeadersFor(cfg, origin);
      cache.set(origin, h);
    }
    return h;
  };
}
function attachAbortGuard(uwsRes) {
  uwsRes.onAborted(() => {
    uwsAborted.set(uwsRes, true);
    markUwsFinished(uwsRes);
  });
}
function collectReqHeaders(uwsReq) {
  const headers = {};
  uwsReq.forEach((k, v) => {
    headers[k.toLowerCase()] = v;
  });
  return headers;
}
function wrapHandler(h, corsHeaders, isShuttingDown, trackRequest2, corsResolver) {
  return (uwsRes, url, rawBody, params, corsHeadersArg, reqHeaders, remoteAddress, user) => {
    const cors2 = corsHeadersArg ?? (corsResolver ? corsResolver(reqHeaders?.origin) : corsHeaders ?? void 0);
    if (isShuttingDown?.()) {
      uwsCorkWrite(uwsRes, () => {
        uwsRes.writeStatus("503 Service Unavailable");
        uwsRes.writeHeader("Content-Type", CT_PROBLEM);
        if (cors2) for (const [k, v] of cors2) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, BODY_503);
      });
      return;
    }
    attachAbortGuard(uwsRes);
    if (!trackRequest2) {
      return h(uwsRes, url, rawBody, params, cors2, reqHeaders, remoteAddress, user);
    }
    const untrack = trackRequest2();
    try {
      const result = h(uwsRes, url, rawBody, params, cors2, reqHeaders, remoteAddress, user);
      if (result && typeof result.then === "function") {
        result.then(untrack, untrack);
      } else {
        untrack();
      }
    } catch {
      untrack();
    }
  };
}
function wrapUwsWs(ws, remoteAddress) {
  return {
    send(data, isBinary = false) {
      ws.send(data, isBinary);
    },
    close() {
      ws.close();
    },
    subscribe(topic) {
      ws.subscribe(topic);
    },
    unsubscribe(topic) {
      ws.unsubscribe(topic);
    },
    publish(topic, data, isBinary = false) {
      ws.publish(topic, data, isBinary);
    },
    isSubscribed(topic) {
      return ws.isSubscribed(topic);
    },
    get remoteAddress() {
      return remoteAddress;
    },
    get data() {
      return ws.getUserData()?._data;
    },
    set data(val) {
      ws.getUserData()._data = val;
    }
  };
}
var wsWrappers = /* @__PURE__ */ new WeakMap();
function getOrCreateWrapper(ws, remoteAddress) {
  let wrapped = wsWrappers.get(ws);
  if (!wrapped) {
    wrapped = wrapUwsWs(ws, remoteAddress);
    wsWrappers.set(ws, wrapped);
  }
  return wrapped;
}
function buildWsBehavior(handler) {
  return {
    maxPayloadLength: handler.maxPayloadLength ?? 1024 * 1024,
    idleTimeout: handler.idleTimeout ?? 120,
    upgrade(res, req, context) {
      const url = req.getUrl();
      const query = req.getQuery();
      const secWsKey = req.getHeader("sec-websocket-key");
      const secWsProtocol = req.getHeader("sec-websocket-protocol");
      const secWsExtensions = req.getHeader("sec-websocket-extensions");
      const headers = {};
      req.forEach((k, v) => {
        headers[k] = v;
      });
      if (!handler.upgrade) {
        res.upgrade({ _data: {} }, secWsKey, secWsProtocol, secWsExtensions, context);
        return;
      }
      let aborted = false;
      res.onAborted(() => {
        aborted = true;
      });
      const result = handler.upgrade({ url, query, headers });
      if (result && typeof result.then === "function") {
        result.then((userData) => {
          if (aborted) return;
          if (userData === false) {
            res.cork(() => {
              res.writeStatus("401 Unauthorized").end();
            });
            return;
          }
          if (aborted) return;
          res.upgrade({ _data: userData }, secWsKey, secWsProtocol, secWsExtensions, context);
        }).catch(() => {
          if (aborted) return;
          res.cork(() => {
            res.writeStatus("500 Internal Server Error").end();
          });
        });
      } else {
        if (result === false) {
          res.writeStatus("401 Unauthorized").end();
          return;
        }
        res.upgrade({ _data: result }, secWsKey, secWsProtocol, secWsExtensions, context);
      }
    },
    open(ws) {
      const remoteAddress = UTF8_DECODER.decode(ws.getRemoteAddressAsText());
      if (handler.open) handler.open(getOrCreateWrapper(ws, remoteAddress));
    },
    message(ws, message, isBinary) {
      if (handler.message) {
        const data = isBinary ? message : UTF8_DECODER.decode(message);
        const wrapped = wsWrappers.get(ws);
        if (wrapped && handler.message) {
          handler.message(wrapped, data, isBinary);
        }
      }
    },
    close(ws, code, message) {
      const wrapped = wsWrappers.get(ws);
      if (wrapped && handler.close) handler.close(wrapped, code, message);
      wsWrappers.delete(ws);
    },
    drain(ws) {
      const wrapped = wsWrappers.get(ws);
      if (wrapped && handler.drain) handler.drain(wrapped);
    }
  };
}
async function createUwsServer(opts) {
  const ephemeral = opts.port === 0;
  const attempts = ephemeral ? 5 : 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const port = ephemeral ? await getFreePort() : opts.port;
    try {
      return await listenUwsOnPort(opts, port);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
function expandUwsPatterns(path2, paramNames) {
  if (!path2.includes("?")) return [{ pattern: path2, paramNames }];
  const segs = path2.split("/");
  const isOptional = (seg) => seg.startsWith(":") && seg.endsWith("?");
  const patternOf = (slice) => slice.map((s) => isOptional(s) ? s.slice(0, -1) : s).join("/") || "/";
  const namesOf = (slice) => {
    const out = [];
    for (const s of slice) {
      if (s.startsWith(":")) out.push(s.slice(1, isOptional(s) ? -1 : void 0));
    }
    return out;
  };
  const variants = [];
  let end = segs.length;
  while (end > 0) {
    const slice = segs.slice(0, end);
    variants.push({ pattern: patternOf(slice), paramNames: namesOf(slice) });
    if (isOptional(segs[end - 1])) end--;
    else break;
  }
  return variants;
}
function listenUwsOnPort(opts, port) {
  const { uws, routes, cors: corsConfig, isShuttingDown, trackRequest: trackRequest2 } = opts;
  const emptyParams = Object.freeze({});
  const corsResolver = corsConfig && Array.isArray(corsConfig.origin) ? makeCorsResolver(corsConfig) : null;
  const corsHeaders = corsConfig && !corsResolver ? buildCorsHeadersFor(corsConfig, corsConfig.origin ?? "*") : null;
  return new Promise((resolve2, reject) => {
    const uwsApp = uws.App();
    if (corsConfig) {
      uwsApp.options("/*", (uwsRes, uwsReq) => {
        const headers = corsResolver ? corsResolver(uwsReq.getHeader("origin") || void 0) : corsHeaders;
        uwsCorkWrite(uwsRes, () => {
          uwsRes.writeStatus("204 No Content");
          if (headers) for (const [k, v] of headers) uwsRes.writeHeader(k, v);
          uwsSafeEnd(uwsRes);
        });
      });
    }
    for (const route of routes) {
      const fn = UWS_METHOD[route.method];
      if (!fn) continue;
      const h = wrapHandler(route.handler, corsHeaders, isShuttingDown, trackRequest2, corsResolver);
      const noBody = NO_BODY_METHODS.has(route.method);
      for (const variant of expandUwsPatterns(route.path, route.paramNames)) {
        const pattern = variant.pattern;
        const names = variant.paramNames;
        const hasParams = names.length > 0;
        if (noBody && !hasParams) {
          uwsApp[fn](pattern, (uwsRes, uwsReq) => {
            const remoteAddress = readUwsRemoteAddress(uwsRes);
            const reqHeaders = collectReqHeaders(uwsReq);
            const query = uwsReq.getQuery();
            h(uwsRes, query ? `${uwsReq.getUrl()}?${query}` : uwsReq.getUrl(), "", emptyParams, void 0, reqHeaders, remoteAddress);
          });
        } else if (noBody && hasParams) {
          uwsApp[fn](pattern, (uwsRes, uwsReq) => {
            const remoteAddress = readUwsRemoteAddress(uwsRes);
            const reqHeaders = collectReqHeaders(uwsReq);
            const rawPath = uwsReq.getUrl();
            const query = uwsReq.getQuery();
            const params = {};
            for (let i = 0; i < names.length; i++) {
              params[names[i]] = decodeRouteParameter(uwsReq.getParameter(i));
            }
            h(uwsRes, query ? `${rawPath}?${query}` : rawPath, "", params, void 0, reqHeaders, remoteAddress);
          });
        } else if (!hasParams) {
          uwsApp[fn](pattern, (uwsRes, uwsReq) => {
            const remoteAddress = readUwsRemoteAddress(uwsRes);
            const reqHeaders = collectReqHeaders(uwsReq);
            const rawPath = uwsReq.getUrl();
            const query = uwsReq.getQuery();
            const url = query ? `${rawPath}?${query}` : rawPath;
            const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
            let aborted = false;
            let totalBytes = 0;
            const chunks = [];
            uwsRes.onAborted(() => {
              aborted = true;
              uwsAborted.set(uwsRes, true);
              markUwsFinished(uwsRes);
            });
            uwsRes.onData((chunk, isLast) => {
              if (aborted) return;
              if (chunk.byteLength > 0) {
                totalBytes += chunk.byteLength;
                if (totalBytes > maxBody) {
                  aborted = true;
                  uwsCorkWrite(uwsRes, () => {
                    uwsRes.writeStatus("413 Payload Too Large");
                    uwsRes.writeHeader("Content-Type", CT_PROBLEM);
                    uwsSafeEnd(uwsRes, bodyTooLargeJson(maxBody));
                  });
                  return;
                }
                chunks.push(Buffer.from(chunk));
              }
              if (isLast) {
                const bodyStr = chunksToUtf8(chunks);
                h(uwsRes, url, bodyStr, emptyParams, void 0, reqHeaders, remoteAddress);
              }
            });
          });
        } else {
          uwsApp[fn](pattern, (uwsRes, uwsReq) => {
            const remoteAddress = readUwsRemoteAddress(uwsRes);
            const reqHeaders = collectReqHeaders(uwsReq);
            const rawPath = uwsReq.getUrl();
            const query = uwsReq.getQuery();
            const url = query ? `${rawPath}?${query}` : rawPath;
            const params = {};
            for (let i = 0; i < names.length; i++) {
              params[names[i]] = decodeRouteParameter(uwsReq.getParameter(i));
            }
            const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
            let aborted = false;
            let totalBytes = 0;
            const chunks = [];
            uwsRes.onAborted(() => {
              aborted = true;
              uwsAborted.set(uwsRes, true);
              markUwsFinished(uwsRes);
            });
            uwsRes.onData((chunk, isLast) => {
              if (aborted) return;
              if (chunk.byteLength > 0) {
                totalBytes += chunk.byteLength;
                if (totalBytes > maxBody) {
                  aborted = true;
                  uwsCorkWrite(uwsRes, () => {
                    uwsRes.writeStatus("413 Payload Too Large");
                    uwsRes.writeHeader("Content-Type", CT_PROBLEM);
                    uwsSafeEnd(uwsRes, bodyTooLargeJson(maxBody));
                  });
                  return;
                }
                chunks.push(Buffer.from(chunk));
              }
              if (isLast) {
                const bodyStr = chunksToUtf8(chunks);
                h(uwsRes, url, bodyStr, params, void 0, reqHeaders, remoteAddress);
              }
            });
          });
        }
      }
    }
    if (opts.wsRoutes) {
      for (const wsRoute of opts.wsRoutes) {
        uwsApp.ws(wsRoute.path, buildWsBehavior(wsRoute.handler));
      }
    }
    uwsApp.any("/*", (uwsRes, uwsReq) => {
      const ch = corsResolver ? corsResolver(uwsReq.getHeader("origin") || void 0) : corsHeaders;
      uwsCorkWrite(uwsRes, () => {
        uwsRes.writeStatus("404 Not Found");
        uwsRes.writeHeader("Content-Type", CT_PROBLEM);
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, BODY_404);
      });
    });
    let listenToken = null;
    uwsApp.listen(port, (token) => {
      if (!token) {
        reject(new Error(`[Kozo] uWS failed to listen on port ${port}`));
        return;
      }
      listenToken = token;
      resolve2({
        port,
        server: {
          close() {
            if (listenToken) uws.us_listen_socket_close(listenToken);
          }
        }
      });
    });
  });
}

// src/fast-response.ts
var CL_CACHE = null;
function fastCL(n) {
  if (n < 1e4) {
    if (!CL_CACHE) {
      CL_CACHE = new Array(1e4);
      for (let i = 0; i < 1e4; i++) CL_CACHE[i] = String(i);
    }
    return CL_CACHE[n];
  }
  return String(n);
}
var CT_JSON2 = "application/json";
var CT_PROBLEM2 = "application/problem+json";
var CT_TEXT = "text/plain";
var CT_HTML = "text/html; charset=utf-8";
var BODY_4042 = JSON.stringify({
  type: "https://kozo-docs.vercel.app/docs/core/errors#not-found",
  title: "Resource Not Found",
  status: 404
});
var LEN_404 = fastCL(Buffer.byteLength(BODY_4042));
var BODY_5002 = JSON.stringify({
  type: "https://kozo-docs.vercel.app/docs/core/errors#internal-error",
  title: "Internal Server Error",
  status: 500
});
var LEN_500 = fastCL(Buffer.byteLength(BODY_5002));
function fastWriteJson(res, body) {
  const len = Buffer.byteLength(body);
  res.writeHead(200, [
    "Content-Type",
    CT_JSON2,
    "Content-Length",
    fastCL(len)
  ]);
  res.end(body);
}
function fastWriteText(res, body, status = 200) {
  const len = Buffer.byteLength(body);
  res.writeHead(status, [
    "Content-Type",
    CT_TEXT,
    "Content-Length",
    fastCL(len)
  ]);
  res.end(body);
}
function fastWriteHtml(res, body, status = 200) {
  const len = Buffer.byteLength(body);
  res.writeHead(status, [
    "Content-Type",
    CT_HTML,
    "Content-Length",
    fastCL(len)
  ]);
  res.end(body);
}
function fastWriteJsonStatus(res, body, status) {
  const len = Buffer.byteLength(body);
  res.writeHead(status, [
    "Content-Type",
    CT_JSON2,
    "Content-Length",
    fastCL(len)
  ]);
  res.end(body);
}
function fastWrite404(res) {
  res.writeHead(404, [
    "Content-Type",
    CT_PROBLEM2,
    "Content-Length",
    LEN_404
  ]);
  res.end(BODY_4042);
}
function fastWrite500(res) {
  res.writeHead(500, [
    "Content-Type",
    CT_PROBLEM2,
    "Content-Length",
    LEN_500
  ]);
  res.end(BODY_5002);
}
function fastWrite400(field, errors, res) {
  const body = JSON.stringify({
    type: "https://kozo-docs.vercel.app/docs/core/errors#validation-failed",
    title: "Validation Failed",
    status: 400,
    errors: (errors ?? []).map((e) => ({
      field: e.instancePath?.replace(/^\//, "").replace(/\//g, ".") || e.params?.missingProperty || "unknown",
      message: e.message || "Invalid value",
      code: e.keyword || "invalid"
    }))
  });
  res.writeHead(400, [
    "Content-Type",
    CT_PROBLEM2,
    "Content-Length",
    fastCL(Buffer.byteLength(body))
  ]);
  res.end(body);
}
function fastWriteError(err, res) {
  if (err instanceof KozoError) {
    const body = JSON.stringify({
      type: `https://kozo-docs.vercel.app/docs/core/errors#${err.code}`,
      title: err.message,
      status: err.statusCode
    });
    res.writeHead(err.statusCode, [
      "Content-Type",
      CT_PROBLEM2,
      "Content-Length",
      fastCL(Buffer.byteLength(body))
    ]);
    res.end(body);
  } else {
    fastWrite500(res);
  }
}

// src/native-context.ts
function fastParseQuery(qs) {
  const result = {};
  let start = 0;
  const len = qs.length;
  while (start < len) {
    let eqIdx = -1;
    let end = len;
    for (let i = start; i < len; i++) {
      const ch = qs.charCodeAt(i);
      if (ch === 61 && eqIdx === -1) eqIdx = i;
      else if (ch === 38) {
        end = i;
        break;
      }
    }
    if (eqIdx > start) {
      const key = qs.slice(start, eqIdx);
      const raw = qs.slice(eqIdx + 1, end);
      result[key] = raw.indexOf("%") !== -1 || raw.indexOf("+") !== -1 ? decodeURIComponent(raw.replace(/\+/g, " ")) : raw;
    }
    start = end + 1;
  }
  return result;
}
function buildNativeContext(req, res, params, body, services, serialize) {
  let _query;
  let _extraHeaders;
  const ctx = {
    req,
    res,
    params,
    body,
    services,
    get query() {
      if (_query === void 0) {
        const url = req.url ?? "/";
        const qIdx = url.indexOf("?");
        if (qIdx === -1) {
          _query = {};
        } else {
          _query = fastParseQuery(url.slice(qIdx + 1));
        }
      }
      return _query;
    },
    json(data, status) {
      const jsonBody = serialize ? serialize(data) : JSON.stringify(data);
      if (_extraHeaders) {
        const hdrs = ["Content-Type", "application/json", "Content-Length", fastCL(Buffer.byteLength(jsonBody))];
        for (const [k, v] of _extraHeaders) hdrs.push(k, v);
        res.writeHead(status ?? 200, hdrs);
        res.end(jsonBody);
      } else if (status !== void 0 && status !== 200) {
        fastWriteJsonStatus(res, jsonBody, status);
      } else {
        fastWriteJson(res, jsonBody);
      }
    },
    text(data, status) {
      fastWriteText(res, data, status ?? 200);
    },
    html(data, status) {
      fastWriteHtml(res, data, status ?? 200);
    },
    header(name, value) {
      if (!_extraHeaders) _extraHeaders = [];
      _extraHeaders.push([name, value]);
      return ctx;
    },
    redirect(url, status) {
      const code = status ?? 302;
      res.writeHead(code, ["Location", url, "Content-Length", "0"]);
      res.end();
    }
  };
  return ctx;
}

// src/scoped-services.ts
function mergeServices(base, scoped) {
  return Object.assign({}, base, scoped);
}
async function resolveScopedServices(config, req) {
  const scoped = await config.factory(config.base, req);
  return {
    services: mergeServices(config.base, scoped),
    finish: async (error) => {
      if (config.onEnd) await config.onEnd(scoped, error);
    }
  };
}
var UwsReqAdapter = class {
  constructor(urlStr, httpMethod, rawBody, headers = {}, clientAddress = "") {
    this.urlStr = urlStr;
    this.httpMethod = httpMethod;
    this.rawBody = rawBody;
    this.headers = headers;
    this.clientAddress = clientAddress;
  }
  header(name) {
    return this.headers[name.toLowerCase()];
  }
  get url() {
    return this.urlStr;
  }
  get method() {
    return this.httpMethod;
  }
  /** Client IP captured synchronously on the uWS path (empty when unavailable). */
  get remoteAddress() {
    return this.clientAddress;
  }
  get path() {
    return this.urlStr.split("?")[0] ?? "/";
  }
  get query() {
    const i = this.urlStr.indexOf("?");
    return i === -1 ? "" : this.urlStr.slice(i + 1);
  }
  text() {
    return Promise.resolve(this.rawBody ?? "");
  }
};

// src/response-serializer.ts
import build from "fast-json-stringify";
import { z as z2 } from "zod";

// src/json-schema.ts
import { z } from "zod";
function zodToJsonSchema(zodSchema) {
  const { $schema, ...rest } = z.toJSONSchema(zodSchema);
  return rest;
}

// src/response-serializer.ts
function dateReplacer(_key, value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}
function toJsonBody(result) {
  if (typeof result === "string") return result;
  return JSON.stringify(result, dateReplacer);
}
function isZodSchema2(schema) {
  return typeof schema === "object" && schema !== null && "safeParse" in schema;
}
function compileZodResponseSerializer(zodSchema) {
  if (zodSchema instanceof z2.ZodAny) {
    return { serialize: toJsonBody, mode: "json-stringify" };
  }
  try {
    const jsonSchema = zodToJsonSchema(zodSchema);
    const stringify = build(jsonSchema);
    return {
      mode: "fast-json-stringify",
      serialize: (data) => {
        if (typeof data === "string") return data;
        return stringify(data);
      }
    };
  } catch (err) {
    return {
      serialize: toJsonBody,
      mode: "json-stringify",
      unsafeFallback: { reason: err?.message ?? String(err) }
    };
  }
}
function compileResponseSerializerSetWithMeta(response) {
  if (!response) return void 0;
  if (isZodSchema2(response)) {
    return { default: compileZodResponseSerializer(response) };
  }
  const byStatus = {};
  for (const [rawStatus, schema] of Object.entries(response)) {
    if (!isZodSchema2(schema)) continue;
    byStatus[Number(rawStatus)] = compileZodResponseSerializer(schema);
  }
  const serializers = Object.values(byStatus);
  if (serializers.length === 0) return void 0;
  return {
    default: byStatus[200] ?? serializers[0],
    byStatus
  };
}

// src/compiler.ts
var VALID_RESULT = Object.freeze({ valid: true, errors: null });
function makeZValidator(schema) {
  return function(data) {
    const r = schema.safeParse(data);
    if (r.success) {
      if (data !== null && typeof data === "object") {
        if (Array.isArray(data)) {
          const rd = r.data;
          const arr = data;
          arr.length = 0;
          for (let i = 0; i < rd.length; i++) arr.push(rd[i]);
        } else {
          const d = data;
          const rd = r.data;
          for (const k of Object.keys(d)) if (!(k in rd)) delete d[k];
          Object.assign(d, rd);
        }
      }
      return VALID_RESULT;
    }
    return {
      valid: false,
      errors: r.error.issues.map((i) => ({
        instancePath: i.path.length ? "/" + i.path.join("/") : "",
        message: i.message,
        keyword: i.code,
        path: i.path
      }))
    };
  };
}
async function resolveHandlerError(err, path2, ctx, hook) {
  if (hook && err instanceof Error) {
    try {
      const custom = hook(err, ctx);
      if (custom instanceof Response) return custom;
      if (custom != null && typeof custom.then === "function") {
        return await custom;
      }
    } catch (hookErr) {
      console.error("[Kozo] onError hook failed:", hookErr);
    }
  }
  if (err instanceof KozoError) return err.toResponse(path2);
  return internalErrorResponse(err, path2);
}
function resolveHandlerErrorSync(err, path2, ctx, hook) {
  if (hook && err instanceof Error) {
    try {
      const custom = hook(err, ctx);
      if (custom instanceof Response) return custom;
    } catch (hookErr) {
      console.error("[Kozo] onError hook failed:", hookErr);
    }
  }
  if (err instanceof KozoError) return err.toResponse(path2);
  return internalErrorResponse(err, path2);
}
var HonoReqAdapter = class {
  /** @internal */
  _c;
  constructor(c) {
    this._c = c;
  }
  header(name) {
    return this._c.req.header(name);
  }
  get url() {
    return this._c.req.url;
  }
  get method() {
    return this._c.req.method;
  }
  get path() {
    return this._c.req.path;
  }
  get query() {
    return this._c.req.query("") ?? "";
  }
  text() {
    return this._c.req.text();
  }
};
var HONO_HEADERS_DIRTY = /* @__PURE__ */ Symbol("kozoHonoHeadersDirty");
var CTX_PROTO = {
  json(data, status) {
    const statusCode = status ?? 200;
    const serialize = this._serializeByStatus ? this._serializeByStatus[statusCode] ?? toJsonBody : this._serialize;
    if (!serialize) return this._c.json(data, status);
    const body = serialize(data);
    if (typeof this._c.body === "function") {
      return this._c.body(body, statusCode, {
        "Content-Type": "application/json"
      });
    }
    return new Response(body, {
      status: statusCode,
      headers: { "Content-Type": "application/json" }
    });
  },
  text(data, status) {
    return this._c.text(data, status);
  },
  html(data, status) {
    return this._c.html(data, status);
  },
  redirect(url, status) {
    return this._c.redirect(url, status);
  },
  header(name, value) {
    this._c[HONO_HEADERS_DIRTY] = true;
    return this._c.header(name, value);
  }
};
function buildCtx(c, extra, serialize, serializeByStatus) {
  const ctx = Object.create(CTX_PROTO);
  ctx._c = c;
  ctx._serialize = serialize;
  ctx._serializeByStatus = serializeByStatus;
  ctx.c = c;
  ctx.body = void 0;
  ctx.query = void 0;
  ctx.params = void 0;
  ctx.headers = void 0;
  ctx.services = void 0;
  ctx.user = c.get?.("user") ?? null;
  ctx.req = new HonoReqAdapter(c);
  ctx.json = CTX_PROTO.json.bind(ctx);
  ctx.text = CTX_PROTO.text.bind(ctx);
  ctx.html = CTX_PROTO.html.bind(ctx);
  ctx.redirect = CTX_PROTO.redirect.bind(ctx);
  ctx.header = CTX_PROTO.header.bind(ctx);
  if (extra) {
    if (extra.body !== void 0) ctx.body = extra.body;
    if (extra.query !== void 0) ctx.query = extra.query;
    if (extra.params !== void 0) ctx.params = extra.params;
    if (extra.headers !== void 0) ctx.headers = extra.headers;
    if (extra.services !== void 0) ctx.services = extra.services;
  }
  return ctx;
}
function honoResultToResponse(c, result, ser) {
  if (result instanceof Response) return result;
  const body = ser(result);
  if (c[HONO_HEADERS_DIRTY]) return c.body(body, 200, { "Content-Type": "application/json" });
  return jsonResponse200(body);
}
async function runHonoScoped(scope, req, run) {
  let err;
  const resolved = await resolveScopedServices(scope, req);
  try {
    return await run(resolved.services, (e) => {
      err = e;
    });
  } finally {
    await resolved.finish(err);
  }
}
function buildUwsHandlerContext(uwsRes, url, rawBody, params, body, query, headers, services, ser, serializeByStatus, method, remoteAddress, corsHeaders, reqHeaders, user) {
  let done = false;
  let userHeaders;
  const finalCors = () => {
    if (!userHeaders) return corsHeaders;
    return corsHeaders ? [...corsHeaders, ...userHeaders] : userHeaders;
  };
  const ctx = {
    req: new UwsReqAdapter(url, method, rawBody, reqHeaders ?? {}, remoteAddress),
    body,
    params,
    query,
    headers,
    services,
    user: user ?? null,
    header(name, value) {
      (userHeaders ??= []).push([name, value]);
    },
    json(data, status) {
      done = true;
      const statusCode = status ?? 200;
      const serialize = serializeByStatus ? serializeByStatus[statusCode] ?? toJsonBody : ser;
      const body2 = serialize(data);
      const ch = finalCors();
      if (status !== void 0 && status !== 200) uwsFastWriteJsonStatus(uwsRes, body2, status, ch);
      else uwsFastWriteJson(uwsRes, body2, ch);
    },
    text(data, status) {
      done = true;
      if (!canWriteUws(uwsRes)) return;
      const ch = finalCors();
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${status ?? 200}`);
        uwsRes.writeHeader("Content-Type", "text/plain");
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, data);
      });
    },
    html(data, status) {
      done = true;
      if (!canWriteUws(uwsRes)) return;
      const ch = finalCors();
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${status ?? 200}`);
        uwsRes.writeHeader("Content-Type", "text/html; charset=utf-8");
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, data);
      });
    },
    redirect(target, status) {
      done = true;
      if (!canWriteUws(uwsRes)) return;
      const ch = finalCors();
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${status ?? 302}`);
        uwsRes.writeHeader("Location", target);
        if (ch) for (const [k, v] of ch) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, "");
      });
    }
  };
  return { ctx, responded: () => done, finalCors };
}
function compileScopedRouteHandler(handler, compiled, scope, errorHook) {
  const {
    validateBody: vb,
    validateQuery: vq,
    validateParams: vp,
    validateHeaders: vh,
    serialize,
    serializeByStatus
  } = compiled;
  const ser = serialize ?? toJsonBody;
  if (vb) {
    return async function hono_scoped_body(c) {
      const path2 = c.req.path;
      const req = new HonoReqAdapter(c);
      try {
        const body = await c.req.json().catch(EMPTY_BODY_HANDLER);
        {
          const r = vb(body);
          if (!r.valid) return validationErrorResponse("body", r.errors, path2);
        }
        let query;
        if (vq) {
          query = c.req.query();
          const r = vq(query);
          if (!r.valid) return validationErrorResponse("query", r.errors, path2);
        }
        let params;
        if (vp) {
          params = c.req.param();
          const r = vp(params);
          if (!r.valid) return validationErrorResponse("params", r.errors, path2);
        }
        let headers;
        if (vh) {
          headers = Object.fromEntries(c.req.raw.headers.entries());
          const r = vh(headers);
          if (!r.valid) return validationErrorResponse("headers", r.errors, path2);
        }
        return await runHonoScoped(scope, req, async (services, signalError) => {
          try {
            const result = await handler(buildCtx(
              c,
              { body, query, params, headers, services },
              ser,
              serializeByStatus
            ));
            return honoResultToResponse(c, result, ser);
          } catch (err) {
            signalError(err);
            return resolveHandlerErrorSync(err, path2, c, errorHook);
          }
        });
      } catch (err) {
        return resolveHandlerErrorSync(err, path2, c, errorHook);
      }
    };
  }
  return async function hono_scoped_sync(c) {
    const path2 = c.req.path;
    const req = new HonoReqAdapter(c);
    try {
      let query;
      if (vq) {
        query = c.req.query();
        const r = vq(query);
        if (!r.valid) return validationErrorResponse("query", r.errors, path2);
      }
      let params;
      if (vp) {
        params = c.req.param();
        const r = vp(params);
        if (!r.valid) return validationErrorResponse("params", r.errors, path2);
      }
      let headers;
      if (vh) {
        headers = Object.fromEntries(c.req.raw.headers.entries());
        const r = vh(headers);
        if (!r.valid) return validationErrorResponse("headers", r.errors, path2);
      }
      return await runHonoScoped(scope, req, async (services, signalError) => {
        try {
          const extra = { query, params, headers, services };
          const result = handler.length === 0 ? handler() : handler(buildCtx(c, extra, ser, serializeByStatus));
          if (result != null && typeof result.then === "function") {
            const r = await result;
            return honoResultToResponse(c, r, ser);
          }
          return honoResultToResponse(c, result, ser);
        } catch (err) {
          signalError(err);
          return resolveHandlerErrorSync(err, path2, c, errorHook);
        }
      });
    } catch (err) {
      return resolveHandlerErrorSync(err, path2, c, errorHook);
    }
  };
}
function isZodSchema3(schema) {
  return typeof schema === "object" && schema !== null && "safeParse" in schema;
}
function jsonResponse200(body) {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}
var EMPTY_BODY = Object.freeze({});
var EMPTY_BODY_HANDLER = () => EMPTY_BODY;
function reportUnsafeResponseFallback(reason, opts) {
  const where = opts.route ? ` for ${opts.route}` : "";
  const msg = `[Kozo] Response schema${where} could not be compiled to an enforcing serializer \u2014 falling back to JSON.stringify WITHOUT field filtering. Fields not declared in the response schema (e.g. passwordHash, tokens, internal flags) will be included in responses. Cause: ${reason}`;
  if (process.env.NODE_ENV === "production" && !opts.dangerouslyAllowUnenforcedResponse) {
    throw new Error(
      `${msg}
Refusing to start: fix the response schema, or pass dangerouslyAllowUnenforcedResponse to ship it unenforced.`
    );
  }
  console.warn(msg);
}
var SchemaCompiler = class {
  static compile(schema, opts = {}) {
    const compiled = {};
    if (schema.body && isZodSchema3(schema.body)) {
      compiled.validateBody = makeZValidator(schema.body);
    }
    if (schema.query && isZodSchema3(schema.query)) {
      compiled.validateQuery = makeZValidator(schema.query);
    }
    if (schema.params && isZodSchema3(schema.params)) {
      compiled.validateParams = makeZValidator(schema.params);
    }
    if (schema.headers && isZodSchema3(schema.headers)) {
      compiled.validateHeaders = makeZValidator(schema.headers);
    }
    if (schema.response) {
      const serializers = compileResponseSerializerSetWithMeta(schema.response);
      if (serializers) {
        compiled.serialize = serializers.default.serialize;
        if (serializers.byStatus) {
          compiled.serializeByStatus = Object.fromEntries(
            Object.entries(serializers.byStatus).map(([status, entry]) => [
              Number(status),
              entry.serialize
            ])
          );
        }
        const entries = serializers.byStatus ? Object.entries(serializers.byStatus) : [["default", serializers.default]];
        for (const [status, entry] of entries) {
          if (entry.unsafeFallback) {
            reportUnsafeResponseFallback(
              `${entry.unsafeFallback.reason} (status ${status})`,
              opts
            );
          }
        }
      }
    }
    return compiled;
  }
};
function compileRouteHandler(handler, schema, services, compiled, scope, errorHook) {
  if (scope?.factory) {
    return compileScopedRouteHandler(handler, compiled, scope, errorHook);
  }
  const {
    validateBody: vb,
    validateQuery: vq,
    validateParams: vp,
    validateHeaders: vh,
    serialize,
    serializeByStatus
  } = compiled;
  const svc = services != null && Object.keys(services).length > 0 ? services : void 0;
  const ser = serialize ?? toJsonBody;
  const noArgs = handler.length === 0;
  if (vb) {
    return async function hono_body(c) {
      const path2 = c.req.path;
      try {
        const body = await c.req.json().catch(EMPTY_BODY_HANDLER);
        {
          const r = vb(body);
          if (!r.valid) return validationErrorResponse("body", r.errors, path2);
        }
        let query;
        if (vq) {
          query = c.req.query();
          const r = vq(query);
          if (!r.valid) return validationErrorResponse("query", r.errors, path2);
        }
        let params;
        if (vp) {
          params = c.req.param();
          const r = vp(params);
          if (!r.valid) return validationErrorResponse("params", r.errors, path2);
        }
        let headers;
        if (vh) {
          headers = Object.fromEntries(c.req.raw.headers.entries());
          const r = vh(headers);
          if (!r.valid) return validationErrorResponse("headers", r.errors, path2);
        }
        const result = await handler(buildCtx(
          c,
          { body, query, params, headers, services: svc },
          ser,
          serializeByStatus
        ));
        return honoResultToResponse(c, result, ser);
      } catch (err) {
        return await resolveHandlerError(err, path2, c, errorHook);
      }
    };
  }
  return function hono_sync(c) {
    try {
      let query;
      if (vq) {
        query = c.req.query();
        const r = vq(query);
        if (!r.valid) return validationErrorResponse("query", r.errors, c.req.path);
      }
      let params;
      if (vp) {
        params = c.req.param();
        const r = vp(params);
        if (!r.valid) return validationErrorResponse("params", r.errors, c.req.path);
      }
      let headers;
      if (vh) {
        headers = Object.fromEntries(c.req.raw.headers.entries());
        const r = vh(headers);
        if (!r.valid) return validationErrorResponse("headers", r.errors, c.req.path);
      }
      const extra = query || params || headers || svc ? { query, params, headers, services: svc } : void 0;
      const result = noArgs ? handler() : handler(buildCtx(c, extra, ser, serializeByStatus));
      if (result instanceof Response) return result;
      if (result != null && typeof result.then === "function") {
        return result.then(
          (r) => honoResultToResponse(c, r, ser),
          (err) => resolveHandlerErrorSync(err, c.req.path, c, errorHook)
        );
      }
      return honoResultToResponse(c, result, ser);
    } catch (err) {
      return resolveHandlerErrorSync(err, c.req.path, c, errorHook);
    }
  };
}
var DEFAULT_MAX_BODY_BYTES2 = 1 * 1024 * 1024;
function compileUwsNativeHandler(handler, schema, services, compiled, scope, maxBodyBytes = DEFAULT_MAX_BODY_BYTES2, method = "GET") {
  const {
    validateBody: vb,
    validateQuery: vq,
    validateParams: vp,
    validateHeaders: vh,
    serialize,
    serializeByStatus
  } = compiled;
  const svc = services != null && Object.keys(services).length > 0 ? services : void 0;
  const ser = serialize ?? toJsonBody;
  const noArgs = handler.length === 0;
  const hasScope = scope?.factory != null;
  function runUwsHandler(uwsRes, url, rawBody, params, body, query, headers, runServices, corsHeaders, reqHeaders, remoteAddress = "", user) {
    const { ctx, responded, finalCors } = buildUwsHandlerContext(
      uwsRes,
      url,
      rawBody,
      params,
      body,
      query,
      headers,
      runServices ?? {},
      ser,
      serializeByStatus,
      method,
      remoteAddress,
      corsHeaders,
      reqHeaders,
      user
    );
    const result = noArgs ? handler() : handler(ctx);
    if (result != null && typeof result.then === "function") {
      result.then(
        (r) => {
          if (!canWriteUws(uwsRes)) return;
          try {
            if (!responded()) uwsFastWriteJson(uwsRes, ser(r), finalCors());
          } catch (err) {
            uwsFastWriteError(err, uwsRes, corsHeaders);
          }
        },
        (err) => {
          if (canWriteUws(uwsRes)) uwsFastWriteError(err, uwsRes, corsHeaders);
        }
      );
      return;
    }
    if (!responded() && canWriteUws(uwsRes)) uwsFastWriteJson(uwsRes, ser(result), finalCors());
  }
  return function uws_handler(uwsRes, url, rawBody, params, corsHeaders, reqHeaders, remoteAddress = "", user) {
    try {
      let body;
      if (vb) {
        if (rawBody && rawBody.length > maxBodyBytes) {
          uwsCorkRespond(uwsRes, () => {
            uwsRes.writeStatus("413 Payload Too Large");
            uwsRes.writeHeader("Content-Type", "application/problem+json");
            if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
            uwsSafeEnd(uwsRes, bodyTooLargeJson(maxBodyBytes));
          });
          return;
        }
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          body = {};
        }
        const r = vb(body);
        if (!r.valid) {
          uwsFastWrite400("body", r.errors, uwsRes, corsHeaders);
          return;
        }
      }
      let query;
      if (vq) {
        const qIdx = url.indexOf("?");
        query = qIdx === -1 ? {} : fastParseQuery(url.slice(qIdx + 1));
        const r = vq(query);
        if (!r.valid) {
          uwsFastWrite400("query", r.errors, uwsRes, corsHeaders);
          return;
        }
      }
      if (vp) {
        const r = vp(params);
        if (!r.valid) {
          uwsFastWrite400("params", r.errors, uwsRes, corsHeaders);
          return;
        }
      }
      let headers;
      if (vh) {
        headers = { ...reqHeaders ?? {} };
        const r = vh(headers);
        if (!r.valid) {
          uwsFastWrite400("headers", r.errors, uwsRes, corsHeaders);
          return;
        }
      }
      if (hasScope && scope) {
        void (async () => {
          let err;
          const resolved = await resolveScopedServices(scope, new UwsReqAdapter(url, method, rawBody, reqHeaders ?? {}, remoteAddress));
          try {
            runUwsHandler(uwsRes, url, rawBody, params, body, query, headers, resolved.services, corsHeaders, reqHeaders, remoteAddress, user);
          } catch (e) {
            err = e;
            if (canWriteUws(uwsRes)) uwsFastWriteError(err, uwsRes, corsHeaders);
          } finally {
            await resolved.finish(err);
          }
        })();
        return;
      }
      runUwsHandler(uwsRes, url, rawBody, params, body, query, headers, svc, corsHeaders, reqHeaders, remoteAddress, user);
    } catch (err) {
      if (canWriteUws(uwsRes)) uwsFastWriteError(err, uwsRes, corsHeaders);
    }
  };
}

// src/client-ip.ts
function honoConnectionAddress(context) {
  const c = context;
  const bindings = c.env?.server ?? c.env;
  return bindings?.incoming?.socket?.remoteAddress ?? c.req?.raw?.socket?.remoteAddress ?? "";
}
function trustedHops(trustProxy) {
  if (trustProxy === true) return 1;
  if (typeof trustProxy === "number" && Number.isInteger(trustProxy) && trustProxy > 0) {
    return trustProxy;
  }
  return 0;
}
function resolveClientIp(source, trustProxy) {
  const connection = source.connectionAddress.trim();
  const depth = trustedHops(trustProxy);
  if (depth > 0) {
    const xff = source.header("x-forwarded-for");
    if (xff) {
      const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
      if (hops.length >= depth) return hops[hops.length - depth];
    }
    const realIp = source.header("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  return connection || "anonymous";
}

// src/middleware/rate-limit.ts
function honoSource(c) {
  return {
    connectionAddress: honoConnectionAddress(c),
    header: (name) => c.req.header(name)
  };
}
function guardSource(req) {
  return {
    connectionAddress: req.remoteAddress ?? "",
    header: (name) => req.header(name)
  };
}
var MAX_MEMORY_KEYS = 1e5;
var maxMemoryKeys = MAX_MEMORY_KEYS;
var memoryMap = /* @__PURE__ */ new Map();
var cleanupTimer = null;
var nextLimiterId = 1;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryMap) {
      if (now > v.resetAt) memoryMap.delete(k);
    }
    if (memoryMap.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 6e4);
  cleanupTimer.unref();
}
function evictIfNeeded() {
  if (memoryMap.size <= maxMemoryKeys) return;
  let overflow = memoryMap.size - maxMemoryKeys;
  for (const oldest of memoryMap.keys()) {
    memoryMap.delete(oldest);
    if (--overflow <= 0) break;
  }
}
var sharedMemoryStore = {
  async increment(key, windowMs) {
    const now = Date.now();
    let record = memoryMap.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
    }
    record.count++;
    memoryMap.set(key, record);
    evictIfNeeded();
    ensureCleanup();
    return record;
  },
  async reset(key) {
    memoryMap.delete(key);
  }
};
function createMemoryStore() {
  const prefix = `limiter:${nextLimiterId++}:`;
  return {
    increment: (key, windowMs) => sharedMemoryStore.increment(prefix + key, windowMs),
    reset: (key) => sharedMemoryStore.reset(prefix + key)
  };
}
function retryAfterSeconds(record) {
  return Math.max(0, Math.ceil((record.resetAt - Date.now()) / 1e3));
}
function rateLimit(options) {
  const {
    max = 100,
    window = 60,
    trustProxy = false,
    keyGenerator = (c) => resolveClientIp(honoSource(c), trustProxy),
    message = "Too many requests",
    store = createMemoryStore()
  } = options;
  const windowMs = window * 1e3;
  return async (c, next) => {
    const key = keyGenerator(c);
    const record = await store.increment(key, windowMs);
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, max - record.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1e3)));
    if (record.count > max) {
      c.header("Retry-After", String(retryAfterSeconds(record)));
      return c.json({ error: message }, 429);
    }
    await next();
  };
}
function rateLimitGuard(options) {
  const {
    max,
    window,
    trustProxy = false,
    keyGenerator = (req) => resolveClientIp(guardSource(req), trustProxy),
    message = "Too many requests",
    store = createMemoryStore()
  } = options;
  const windowMs = window * 1e3;
  return async (req) => {
    const record = await store.increment(keyGenerator(req), windowMs);
    const headers = {
      "X-RateLimit-Limit": String(max),
      "X-RateLimit-Remaining": String(Math.max(0, max - record.count)),
      "X-RateLimit-Reset": String(Math.ceil(record.resetAt / 1e3))
    };
    if (record.count > max) {
      headers["Retry-After"] = String(retryAfterSeconds(record));
      return { deny: { status: 429, body: { error: message }, headers } };
    }
    return { headers };
  };
}
function clearRateLimitStore() {
  memoryMap.clear();
  if (cleanupTimer) clearInterval(cleanupTimer);
  cleanupTimer = null;
}

// src/shutdown.ts
function createInflightTracker() {
  return {
    count: 0,
    requests: /* @__PURE__ */ new Set()
  };
}
function trackRequest(tracker) {
  tracker.count++;
  let resolvePromise;
  const promise = new Promise((resolve2) => {
    resolvePromise = resolve2;
  });
  tracker.requests.add(promise);
  return () => {
    tracker.count--;
    tracker.requests.delete(promise);
    resolvePromise();
  };
}
var ShutdownManager = class {
  state = "running";
  abortController = null;
  server = null;
  tracker;
  database = null;
  databaseProvider = null;
  cleanupHooks = [];
  shutdownStartCallbacks = [];
  // Drain gate for fast-path (count-only) requests
  countDrainResolve = null;
  constructor() {
    this.tracker = createInflightTracker();
  }
  /**
   * Register a callback to be called when shutdown starts
   */
  onShutdownStart(callback) {
    this.shutdownStartCallbacks.push(callback);
  }
  /**
   * Get current shutdown state
   */
  getState() {
    return this.state;
  }
  /**
   * Check if server is shutting down
   */
  isShuttingDown() {
    return this.state !== "running";
  }
  /**
   * Get current in-flight request count
   */
  getInflightCount() {
    return this.tracker.count;
  }
  /**
   * Set the server instance for shutdown
   */
  setServer(server) {
    this.server = server;
  }
  /**
   * Set database for cleanup
   */
  setDatabase(db, provider) {
    this.database = db;
    this.databaseProvider = provider;
  }
  /**
   * Get the AbortController signal for request cancellation
   */
  getAbortSignal() {
    return this.abortController?.signal;
  }
  /**
   * Create a request tracker middleware
   * Returns an untrack function to call when request completes
   * Lazy allocation: only creates Promise when shutting down
   */
  trackRequest() {
    if (this.state === "running") {
      this.tracker.count++;
      return () => {
        this.tracker.count--;
        if (this.state !== "running" && this.tracker.count === 0 && this.countDrainResolve) {
          this.countDrainResolve();
          this.countDrainResolve = null;
        }
      };
    }
    return trackRequest(this.tracker);
  }
  /**
   * Register a cleanup callback to run during shutdown (after draining requests, before closing DB).
   * Plugins should use this instead of raw process.on('SIGTERM', ...).
   */
  addCleanupHook(fn) {
    this.cleanupHooks.push(fn);
  }
  /**
   * Initiate graceful shutdown
   */
  async shutdown(options = {}) {
    const {
      timeoutMs = 3e4,
      onShutdownStart,
      onShutdownComplete,
      onShutdownTimeout
    } = options;
    if (this.state === "shutdown") {
      console.warn("[Kozo] Shutdown already completed");
      return;
    }
    if (this.state === "shutting-down") {
      console.warn("[Kozo] Shutdown already in progress");
      return;
    }
    this.state = "shutting-down";
    for (const cb of this.shutdownStartCallbacks) cb();
    this.abortController = new AbortController();
    this.abortController.abort();
    const inflightCount = this.tracker.count;
    onShutdownStart?.(inflightCount);
    if (inflightCount > 0) {
      console.log(`[Kozo] Graceful shutdown: waiting for ${inflightCount} in-flight requests`);
    }
    if (this.server) {
      this.server.close(() => {
        console.log("[Kozo] HTTP server closed");
      });
    }
    const drainPromise = this.drainRequests();
    let timer;
    const timeoutPromise = new Promise((resolve2) => {
      timer = setTimeout(() => {
        const remaining = this.tracker.count;
        if (remaining > 0) {
          console.warn(
            `[Kozo] Shutdown timed out after ${timeoutMs}ms with ${remaining} request(s) still in-flight \u2014 forcing close`
          );
        }
        onShutdownTimeout?.(remaining);
        resolve2();
      }, timeoutMs);
    });
    await Promise.race([drainPromise, timeoutPromise]);
    clearTimeout(timer);
    if (this.cleanupHooks.length > 0) {
      await Promise.allSettled(this.cleanupHooks.map((fn) => fn()));
    }
    await this.closeDatabase();
    this.state = "shutdown";
    onShutdownComplete?.();
    console.log("[Kozo] Graceful shutdown complete");
  }
  /**
   * Wait for all in-flight requests to complete.
   * Handles both fast-path (count-only) and slow-path (Promise-tracked) requests.
   */
  async drainRequests() {
    const slowPathDrain = this.tracker.requests.size > 0 ? Promise.all([...this.tracker.requests]) : Promise.resolve();
    let fastPathDrain;
    if (this.tracker.count === 0) {
      fastPathDrain = Promise.resolve();
    } else {
      fastPathDrain = new Promise((resolve2) => {
        this.countDrainResolve = resolve2;
      });
    }
    await Promise.all([slowPathDrain, fastPathDrain]);
  }
  /**
   * Close database connections based on provider
   */
  async closeDatabase() {
    if (!this.database || !this.databaseProvider) {
      return;
    }
    try {
      switch (this.databaseProvider) {
        case "postgresql": {
          const client = this.database.$client;
          if (client && typeof client.end === "function") {
            await client.end();
            console.log("[Kozo] PostgreSQL connection closed");
          }
          break;
        }
        case "mysql": {
          const client = this.database.$client;
          if (client && typeof client.end === "function") {
            await client.end();
            console.log("[Kozo] MySQL connection closed");
          }
          break;
        }
        case "sqlite": {
          const client = this.database.$client;
          if (client && typeof client.close === "function") {
            client.close();
            console.log("[Kozo] SQLite connection closed");
          }
          break;
        }
      }
    } catch (err) {
      console.error("[Kozo] Error closing database connection:", err);
    }
  }
};
function createShutdownManager() {
  return new ShutdownManager();
}

// src/router.ts
import { readdir } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

// src/utils/file-to-path.ts
import { parse } from "path";
var HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
function fileToPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parsed = parse(normalized);
  const filename = parsed.name.toLowerCase();
  let method = "get";
  let includeName = true;
  if (HTTP_METHODS.includes(filename)) {
    method = filename;
    includeName = false;
  } else if (filename === "index") {
    includeName = false;
  }
  let segments = parsed.dir ? parsed.dir.split("/").filter(Boolean) : [];
  if (includeName) {
    segments.push(parsed.name);
  }
  const urlSegments = segments.map((segment) => {
    if (segment.startsWith("[...") && segment.endsWith("]")) {
      return "*";
    }
    if (segment.startsWith("[") && segment.endsWith("?]")) {
      return ":" + segment.slice(1, -2) + "?";
    }
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return ":" + segment.slice(1, -1);
    }
    return segment;
  });
  let path2 = "/" + urlSegments.join("/");
  path2 = path2.replace(/\/+/g, "/");
  if (path2.length > 1 && path2.endsWith("/")) {
    path2 = path2.slice(0, -1);
  }
  return { path: path2, method };
}
function isRouteFile(filename) {
  const segments = filename.replace(/\\/g, "/").split("/");
  if (segments.some((s) => s.startsWith("_"))) return false;
  if (filename.includes(".test.") || filename.includes(".spec.")) return false;
  return filename.endsWith(".ts") || filename.endsWith(".js");
}
function isMiddlewareFile(filename) {
  const normalized = filename.replace(/\\/g, "/");
  const basename = normalized.split("/").pop() ?? "";
  return /^_middleware\.(ts|js)$/.test(basename);
}

// src/router.ts
async function scanFiles(dir, base = "") {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      results.push(...await scanFiles(join(dir, e.name), rel));
    } else if (/\.(ts|js)$/.test(e.name) && !e.name.startsWith("_") && !e.name.endsWith(".test.ts") && !e.name.endsWith(".test.js") && !e.name.endsWith(".spec.ts") && !e.name.endsWith(".spec.js")) {
      results.push(rel);
    }
  }
  return results;
}
async function scanMiddlewareFiles(dir, base = "") {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const rel = base ? `${base}/${e.name}` : e.name;
      results.push(...await scanMiddlewareFiles(join(dir, e.name), rel));
    } else if (isMiddlewareFile(e.name)) {
      results.push(base ? `${base}/${e.name}` : e.name);
    }
  }
  return results;
}
function routeModuleUrl(fullPath) {
  return pathToFileURL(fullPath).href.replace(/%5B/gi, "[").replace(/%5D/gi, "]");
}
function isRouteDefinitionOptions(value) {
  return value !== null && typeof value === "object" && "handler" in value && typeof value.handler === "function";
}
function resolveRouteModule(module) {
  const d = module.default;
  if (isRouteDefinitionOptions(d)) {
    return {
      handler: d.handler,
      schema: d.schema ?? module.schema ?? {},
      meta: d.meta ?? module.meta
    };
  }
  if (typeof d === "function") {
    return {
      handler: d,
      schema: module.schema ?? {},
      meta: module.meta
    };
  }
  return null;
}
async function scanRoutes(options) {
  const { routesDir, verbose = true } = options;
  if (verbose) {
    console.log(`
\u{1F50D} Scanning routes in: ${routesDir}
`);
  }
  const files = await scanFiles(routesDir);
  const results = await Promise.allSettled(
    files.filter(isRouteFile).map(async (file) => {
      const parsed = fileToPath(file);
      if (!parsed) return null;
      const fullPath = join(routesDir, file);
      const fileUrl = routeModuleUrl(fullPath);
      const module = await import(fileUrl);
      if (!resolveRouteModule(module)) {
        return { type: "no-export", file };
      }
      return {
        type: "route",
        path: parsed.path,
        method: parsed.method,
        filePath: fullPath,
        module
      };
    })
  );
  const routes = [];
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(`\u274C Failed to load route: ${r.reason}`);
      continue;
    }
    const val = r.value;
    if (!val) continue;
    if (val.type === "no-export") {
      if (verbose) console.warn(`\u26A0\uFE0F  Skipping ${val.file}: no default export (function or { handler })`);
      continue;
    }
    routes.push({
      path: val.path,
      method: val.method,
      filePath: val.filePath,
      module: val.module
    });
    if (verbose) {
      const methodLabel = val.method.toUpperCase().padEnd(6);
      console.log(`   ${methodLabel} ${val.path}`);
    }
  }
  if (verbose) {
    console.log(`
\u2705 Loaded ${routes.length} routes
`);
  }
  routes.sort((a, b) => {
    const diff = routeScore(b.path) - routeScore(a.path);
    if (diff !== 0) return diff;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return routes;
}
function routeScore(path2) {
  const segments = path2.split("/").filter(Boolean);
  let score = segments.length * 10;
  for (const segment of segments) {
    if (segment === "*") {
      score -= 100;
    } else if (segment.startsWith(":")) {
      score -= 5;
    } else {
      score += 1;
    }
  }
  return score;
}
async function scanMiddleware(options) {
  const { routesDir, verbose = false } = options;
  const files = await scanMiddlewareFiles(routesDir);
  const definitions = [];
  for (const file of files) {
    const fullPath = join(routesDir, file);
    const fileUrl = routeModuleUrl(fullPath);
    try {
      const mod = await import(fileUrl);
      const handler = mod.default;
      if (typeof handler !== "function") {
        if (verbose) console.warn(`\u26A0\uFE0F  Skipping ${file}: no default export function`);
        continue;
      }
      const dir = file.replace(/\\/g, "/").replace(/\/_middleware\.(ts|js)$/, "").replace(/_middleware\.(ts|js)$/, "");
      const pathPrefix = dir ? `/${dir}/*` : "/*";
      definitions.push({ pathPrefix, handler, filePath: fullPath });
      if (verbose) {
        console.log(`   \u{1F6E1}\uFE0F  ${pathPrefix.padEnd(30)} \u2190 ${file}`);
      }
    } catch (err) {
      throw new Error(
        `[Kozo] Failed to load middleware ${file}: ${err.message}`,
        { cause: err }
      );
    }
  }
  definitions.sort((a, b) => {
    const depthA = a.pathPrefix.split("/").length;
    const depthB = b.pathPrefix.split("/").length;
    return depthA - depthB;
  });
  return definitions;
}

// src/guard.ts
var STATUS_TITLES = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable"
};
function denyBodyJson(d) {
  return JSON.stringify(
    d.body ?? { title: STATUS_TITLES[d.status] ?? "Request Denied", status: d.status }
  );
}
var RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
function compileGuardPattern(pattern) {
  if (pattern === "*" || pattern === "/*") return /(?:)/;
  let re = "";
  for (const seg of pattern.split("/").filter(Boolean)) {
    if (seg === "*") return new RegExp(`^${re}(?:/.*)?$`);
    re += "/" + (seg.startsWith(":") ? "[^/]+" : seg.replace(RE_ESCAPE, "\\$&"));
  }
  return new RegExp(`^${re}/?$`);
}
function guardToHonoMiddleware(guard) {
  return async (c, next) => {
    const u = new URL(c.req.url);
    const greq = {
      method: c.req.method,
      path: u.pathname,
      url: u.pathname + u.search,
      remoteAddress: honoRemoteAddress(c),
      params: c.req.param(),
      get user() {
        return honoUser(c);
      },
      header: (n) => c.req.header(n)
    };
    const r = await guard(greq);
    if (r != null) {
      if (r.deny) {
        return new Response(denyBodyJson(r.deny), {
          status: r.deny.status,
          headers: { "Content-Type": "application/json", ...r.deny.headers }
        });
      }
      if (r.user !== void 0) c.set("user", r.user);
      if (r.headers) {
        await next();
        for (const k in r.headers) c.res.headers.set(k, r.headers[k]);
        return;
      }
    }
    return next();
  };
}
function honoUser(c) {
  try {
    return c.get("user") ?? null;
  } catch {
    return null;
  }
}
function honoRemoteAddress(c) {
  return honoConnectionAddress(c);
}
function compileGuards(entries) {
  return entries.map((e) => ({ re: compileGuardPattern(e.pattern), guard: e.guard }));
}
function wrapNativeWithGuards(guards, inner, method) {
  return (uwsRes, url, rawBody, params, corsHeaders, reqHeaders, remoteAddress = "") => {
    const qIdx = url.indexOf("?");
    const path2 = qIdx === -1 ? url : url.slice(0, qIdx);
    let user = null;
    let extraHeaders = null;
    const greq = {
      method,
      path: path2,
      url,
      remoteAddress,
      params,
      get user() {
        return user;
      },
      header: (n) => reqHeaders?.[n.toLowerCase()]
    };
    const denyNow = (d) => {
      uwsCorkRespond(uwsRes, () => {
        uwsRes.writeStatus(`${d.status} ${STATUS_TITLES[d.status] ?? ""}`.trimEnd());
        uwsRes.writeHeader("Content-Type", "application/json");
        if (d.headers) for (const k in d.headers) uwsRes.writeHeader(k, d.headers[k]);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsSafeEnd(uwsRes, denyBodyJson(d));
      });
    };
    const apply = (r) => {
      if (r == null) return false;
      if (r.deny) {
        denyNow(r.deny);
        return true;
      }
      if (r.user !== void 0) user = r.user;
      if (r.headers) {
        extraHeaders ??= [];
        for (const k in r.headers) extraHeaders.push([k, r.headers[k]]);
      }
      return false;
    };
    const proceed = () => {
      const ch = extraHeaders ? [...corsHeaders ?? [], ...extraHeaders] : corsHeaders;
      return inner(uwsRes, url, rawBody, params, ch, reqHeaders, remoteAddress, user);
    };
    let i = 0;
    const step = () => {
      while (i < guards.length) {
        const g = guards[i++];
        if (!g.re.test(path2)) continue;
        const r = g.guard(greq);
        if (r != null && typeof r.then === "function") {
          return r.then((res) => {
            if (apply(res)) return;
            return step();
          });
        }
        if (apply(r)) return;
      }
      return proceed();
    };
    try {
      const p = step();
      if (p != null && typeof p.then === "function") {
        return p.catch((err) => {
          uwsFastWriteError(err, uwsRes, corsHeaders);
        });
      }
    } catch (err) {
      uwsFastWriteError(err, uwsRes, corsHeaders);
    }
  };
}

// src/ssr.ts
import {
  createServer as createHttpServer
} from "http";
import { Writable } from "stream";
import { createRequire } from "module";
import path from "path";
import { pathToFileURL as pathToFileURL2 } from "url";
import fs from "fs/promises";
import { createReadStream } from "fs";
var MIME = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".wasm": "application/wasm"
};
var IMMUTABLE_RE = /[.-][a-f0-9]{8,}\.(js|css|svg|png|jpg|jpeg|gif|webp|woff2?)$/i;
var STATIC_CACHE = /* @__PURE__ */ new Map();
var MAX_CACHE_SIZE = 1024 * 1024;
var cacheSize = 0;
function evictIfNeeded2() {
  if (cacheSize <= 50 * 1024 * 1024) return;
  for (const [key, entry] of STATIC_CACHE) {
    STATIC_CACHE.delete(key);
    cacheSize -= entry.size;
    if (cacheSize <= 40 * 1024 * 1024) break;
  }
}
function splitAtPlaceholder(tpl, placeholder) {
  const idx = tpl.indexOf(placeholder);
  if (idx === -1) return [tpl, ""];
  return [tpl.slice(0, idx), tpl.slice(idx + placeholder.length)];
}
function pipeStreamResponse(res, headPart, tailPart, pipe) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.write(headPart);
  const sink = new Writable({
    write(chunk, _enc, cb) {
      res.write(chunk, cb);
    },
    final(cb) {
      res.end(tailPart, cb);
    }
  });
  pipe(sink);
}
function hasDotfileSegment(relPath) {
  for (const seg of relPath.split(/[/\\]+/)) {
    if (seg.startsWith(".") && seg !== "." && seg !== "..") return true;
  }
  return false;
}
var realRootCache = /* @__PURE__ */ new Map();
async function getRealRoot(staticDir) {
  let real = realRootCache.get(staticDir);
  if (real === void 0) {
    real = await fs.realpath(staticDir);
    realRootCache.set(staticDir, real);
  }
  return real;
}
async function serveStaticFile(staticDir, urlPath, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return true;
  }
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  if (hasDotfileSegment(safePath)) return false;
  const filePath = path.join(staticDir, safePath);
  if (!filePath.startsWith(staticDir)) return false;
  const cached = STATIC_CACHE.get(filePath);
  if (cached) {
    STATIC_CACHE.delete(filePath);
    STATIC_CACHE.set(filePath, cached);
    const headers = {
      "Content-Type": cached.mime,
      "Content-Length": String(cached.size)
    };
    if (IMMUTABLE_RE.test(filePath)) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    res.writeHead(200, headers);
    res.end(cached.content);
    return true;
  }
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    const [realFile, realRoot] = await Promise.all([fs.realpath(filePath), getRealRoot(staticDir)]);
    if (!realFile.startsWith(realRoot + path.sep)) return false;
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const headers = {
      "Content-Type": mime,
      "Content-Length": String(stat.size)
    };
    if (IMMUTABLE_RE.test(filePath)) {
      headers["Cache-Control"] = "public, max-age=31536000, immutable";
    }
    if (stat.size <= MAX_CACHE_SIZE) {
      const content = await fs.readFile(filePath);
      STATIC_CACHE.set(filePath, { content, mime, size: stat.size });
      cacheSize += stat.size;
      evictIfNeeded2();
      res.writeHead(200, headers);
      res.end(content);
      return true;
    }
    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}
function hasFileExtension(pathname) {
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}
function matchesApiPrefix(url, prefixes) {
  return prefixes.some((p) => url.startsWith(p));
}
function normalizePrefixes(apiPrefix) {
  if (!apiPrefix) return ["/api"];
  return Array.isArray(apiPrefix) ? apiPrefix : [apiPrefix];
}
async function createSsrServer(config, honoHandler, port = 3e3) {
  const isProd = process.env.NODE_ENV === "production";
  const root = path.resolve(config.root);
  const apiPrefixes = normalizePrefixes(config.apiPrefix);
  const appPlaceholder = config.appPlaceholder ?? "<!--app-html-->";
  const headPlaceholder = config.headPlaceholder ?? "<!--ssr-head-->";
  if (isProd) {
    return startProductionServer(config, root, apiPrefixes, appPlaceholder, headPlaceholder, honoHandler, port);
  }
  return startDevServer(config, root, apiPrefixes, appPlaceholder, headPlaceholder, honoHandler, port);
}
async function startProductionServer(config, root, apiPrefixes, appPlaceholder, headPlaceholder, honoHandler, port) {
  const distClient = path.resolve(root, config.distClient ?? "dist/client");
  const distServer = path.resolve(root, config.distServer ?? "dist/server");
  const template = await fs.readFile(path.resolve(distClient, "index.html"), "utf-8");
  const entryName = path.basename(config.entryServer).replace(/\.tsx?$/, ".js");
  const serverEntryPath = path.resolve(distServer, entryName);
  const { render } = await import(pathToFileURL2(serverEntryPath).href);
  const server = createHttpServer(async (req, res) => {
    const url = req.url ?? "/";
    if (matchesApiPrefix(url, apiPrefixes)) {
      await honoHandler(req, res);
      return;
    }
    const pathname = url.split("?")[0];
    if (await serveStaticFile(distClient, pathname, res)) return;
    try {
      const result = await render(url);
      if ("pipe" in result && typeof result.pipe === "function") {
        let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
        if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
        pipeStreamResponse(res, headPart, tailPart, result.pipe);
      } else {
        let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
        if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
        const html = headPart + result.html + tailPart;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      }
    } catch (e) {
      console.error("[Kozo SSR] Render error:", e);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });
  return new Promise((resolve2) => {
    server.listen(port, () => {
      if (config.logger !== false) {
        console.log(`\u{1F680} Kozo SSR production server \u2192 http://localhost:${port}`);
      }
      resolve2({ server, port });
    });
  });
}
async function startDevServer(config, root, apiPrefixes, appPlaceholder, headPlaceholder, honoHandler, port) {
  const templatePath = path.resolve(root, config.template ?? "index.html");
  const entryServer = config.entryServer;
  let devSsr;
  if (config.devSsr !== void 0) {
    devSsr = config.devSsr;
  } else {
    let templateContent = "";
    try {
      templateContent = await fs.readFile(templatePath, "utf-8");
    } catch {
    }
    devSsr = templateContent.includes(appPlaceholder);
    if (devSsr) {
      console.log("[Kozo SSR] devSsr auto-enabled (index.html contains app placeholder). Set devSsr: false explicitly to use CSR mode.");
    }
  }
  const criticalCss = config.devCriticalCss ?? "body{background:rgb(15 23 42);color:rgb(241 245 249)}#root{visibility:hidden}";
  let createViteServer;
  try {
    const localRequire = createRequire(path.resolve(root, "package.json"));
    const viteDir = path.dirname(localRequire.resolve("vite/package.json"));
    const vitePkgRaw = await fs.readFile(path.join(viteDir, "package.json"), "utf-8");
    const vitePkg = JSON.parse(vitePkgRaw);
    const esmEntry = vitePkg.exports?.["."]?.import?.default ?? vitePkg.exports?.["."]?.import ?? vitePkg.module ?? "dist/node/index.js";
    const vitePath = path.resolve(viteDir, esmEntry);
    const viteMod = await import(pathToFileURL2(vitePath).href);
    createViteServer = viteMod.createServer ?? viteMod.default?.createServer;
  } catch {
    throw new Error(
      `[Kozo SSR] Vite is required for dev mode but not installed.
Run: pnpm add -D vite (in ${root})`
    );
  }
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "custom"
  });
  const server = createHttpServer(async (req, res) => {
    const url = req.url ?? "/";
    if (matchesApiPrefix(url, apiPrefixes)) {
      await honoHandler(req, res);
      return;
    }
    await new Promise((resolve2) => {
      vite.middlewares(req, res, resolve2);
    });
    if (res.writableEnded) return;
    const pathname = url.split("?")[0];
    if (hasFileExtension(pathname)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      let template = await fs.readFile(templatePath, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      if (devSsr) {
        const mod = await vite.ssrLoadModule(path.resolve(root, entryServer));
        const result = await mod.render(url);
        if ("pipe" in result && typeof result.pipe === "function") {
          let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
          if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
          pipeStreamResponse(res, headPart, tailPart, result.pipe);
          return;
        }
        if ("html" in result) {
          let [headPart, tailPart] = splitAtPlaceholder(template, appPlaceholder);
          if (result.head) headPart = headPart.replace(headPlaceholder, result.head);
          const html = headPart + result.html + tailPart;
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
          return;
        }
      } else {
        if (criticalCss) {
          template = template.replace("</head>", `<style>${criticalCss}</style></head>`);
        }
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      console.error("[Kozo SSR]", e);
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve2) => {
    server.listen(port, () => {
      if (config.logger !== false) {
        console.log(`\u26A1 Kozo SSR dev server \u2192 http://localhost:${port}`);
      }
      resolve2({ server, port });
    });
  });
}

// src/openapi.ts
var OpenAPIGenerator = class {
  config;
  schemas = /* @__PURE__ */ new Map();
  schemaCounter = 0;
  constructor(config) {
    this.config = config;
  }
  /**
   * Generate OpenAPI spec from routes
   */
  generate(routes) {
    const paths = {};
    for (const route of routes) {
      const openApiPath = this.honoPathToOpenApi(route.path);
      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }
      paths[openApiPath][route.method] = this.routeToOperation(route);
    }
    return {
      openapi: "3.1.0",
      info: this.config.info,
      servers: this.config.servers,
      tags: this.config.tags,
      paths,
      components: {
        schemas: Object.fromEntries(this.schemas),
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT"
          }
        }
      },
      security: this.config.security
    };
  }
  /**
   * Convert Hono path params to OpenAPI format
   * :id -> {id}
   */
  honoPathToOpenApi(path2) {
    return path2.replace(/:([^/]+)/g, "{$1}");
  }
  /**
   * Convert route to OpenAPI operation
   */
  routeToOperation(route) {
    const { path: path2, method, module } = route;
    const { schema, meta } = module;
    const operation = {
      operationId: this.generateOperationId(path2, method),
      summary: meta?.summary || `${method.toUpperCase()} ${path2}`,
      description: meta?.description,
      tags: meta?.tags || [this.extractTag(path2)],
      parameters: [],
      responses: {
        "200": {
          description: "Successful response",
          content: {
            "application/json": {
              schema: { type: "object" }
            }
          }
        },
        "400": {
          description: "Validation error"
        },
        "500": {
          description: "Internal server error"
        }
      }
    };
    const pathParams = path2.match(/:([^/]+)/g);
    if (pathParams) {
      for (const param of pathParams) {
        const paramName = param.slice(1);
        operation.parameters.push({
          name: paramName,
          in: "path",
          required: true,
          schema: { type: "string" }
        });
      }
    }
    if (schema?.query) {
      const querySchema = zodToJsonSchema(schema.query);
      if (querySchema.properties) {
        for (const [name, propSchema] of Object.entries(querySchema.properties)) {
          operation.parameters.push({
            name,
            in: "query",
            required: querySchema.required?.includes(name) || false,
            schema: propSchema
          });
        }
      }
    }
    if (schema?.headers) {
      const headerSchema = zodToJsonSchema(schema.headers);
      if (headerSchema.properties) {
        for (const [name, propSchema] of Object.entries(headerSchema.properties)) {
          operation.parameters.push({
            name,
            in: "header",
            required: headerSchema.required?.includes(name) || false,
            schema: propSchema
          });
        }
      }
    }
    if (schema?.params) {
      const paramsSchema = zodToJsonSchema(schema.params);
      if (paramsSchema.properties) {
        for (const [name, propSchema] of Object.entries(paramsSchema.properties)) {
          const existingIdx = operation.parameters.findIndex(
            (p) => p.name === name && p.in === "path"
          );
          if (existingIdx >= 0) {
            operation.parameters[existingIdx].schema = propSchema;
          }
        }
      }
    }
    if (["post", "put", "patch"].includes(method) && schema?.body) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: zodToJsonSchema(schema.body)
          }
        }
      };
    }
    if (schema?.response) {
      for (const [status, responseSchema] of Object.entries(schema.response)) {
        operation.responses[status] = {
          description: this.getStatusDescription(parseInt(status)),
          content: {
            "application/json": {
              schema: zodToJsonSchema(responseSchema)
            }
          }
        };
      }
    }
    if (meta?.auth) {
      operation.security = [{ bearerAuth: [] }];
    }
    return operation;
  }
  /**
   * Generate operation ID from path and method
   */
  generateOperationId(path2, method) {
    const parts = path2.split("/").filter(Boolean).map((part) => {
      if (part.startsWith(":")) {
        return "By" + this.capitalize(part.slice(1));
      }
      return this.capitalize(part);
    });
    return method + parts.join("");
  }
  /**
   * Extract tag from path (first segment)
   */
  extractTag(path2) {
    const firstSegment = path2.split("/").filter(Boolean)[0];
    return firstSegment ? this.capitalize(firstSegment) : "Default";
  }
  /**
   * Get HTTP status description
   */
  getStatusDescription(status) {
    const descriptions = {
      200: "OK",
      201: "Created",
      204: "No Content",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error"
    };
    return descriptions[status] || "Response";
  }
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
};
function generateSwaggerHtml(specUrl, title = "API Documentation") {
  const safeSpecUrl = specUrl.replace(
    /[&'"<>]/g,
    (c) => ({ "&": "&amp;", "'": "&#39;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]
  );
  const safeTitle = title.replace(
    /[&'"<>]/g,
    (c) => ({ "&": "&amp;", "'": "&#39;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]
  );
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '${safeSpecUrl}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        persistAuthorization: true
      });
    };
  </script>
</body>
</html>`;
}
function createOpenAPIGenerator(config) {
  return new OpenAPIGenerator(config);
}

// src/contract.ts
function joinRoutePaths(prefix, path2) {
  const prefixPart = prefix.replace(/^\/+|\/+$/g, "");
  const pathPart = path2.replace(/^\/+|\/+$/g, "");
  if (!prefixPart) return pathPart ? `/${pathPart}` : "/";
  return pathPart ? `/${prefixPart}/${pathPart}` : `/${prefixPart}`;
}
var RouteContract = class {
  registrations = [];
  get(path2, schemaOrHandler, handler, meta) {
    return this.add("get", path2, schemaOrHandler, handler, meta);
  }
  post(path2, schemaOrHandler, handler, meta) {
    return this.add("post", path2, schemaOrHandler, handler, meta);
  }
  put(path2, schemaOrHandler, handler, meta) {
    return this.add("put", path2, schemaOrHandler, handler, meta);
  }
  patch(path2, schemaOrHandler, handler, meta) {
    return this.add("patch", path2, schemaOrHandler, handler, meta);
  }
  delete(path2, schemaOrHandler, handler, meta) {
    return this.add("delete", path2, schemaOrHandler, handler, meta);
  }
  add(method, path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") {
      this.registrations.push({
        method,
        path: path2,
        schema: {},
        handler: schemaOrHandler
      });
    } else {
      this.registrations.push({
        method,
        path: path2,
        schema: schemaOrHandler,
        handler,
        meta
      });
    }
    return this;
  }
};
function createRouter() {
  return new RouteContract();
}
var defineRoutes = createRouter;
function getContractRouteRegistrations(contract) {
  return contract.registrations;
}

// src/app.ts
function docsRouteTag(path2) {
  const segments = path2.split("/").filter(Boolean);
  const seg = (segments[0]?.toLowerCase() === "api" ? segments[1] : segments[0]) ?? "general";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}
var KozoGroup = class _KozoGroup {
  constructor(prefix, parent) {
    this.prefix = prefix;
    this.parent = parent;
  }
  get(path2, schemaOrHandler, handler, meta) {
    const fullPath = joinRoutePaths(this.prefix, path2);
    if (typeof schemaOrHandler === "function") this.parent.get(fullPath, schemaOrHandler);
    else this.parent.get(fullPath, schemaOrHandler, handler, meta);
    return this;
  }
  post(path2, schemaOrHandler, handler, meta) {
    const fullPath = joinRoutePaths(this.prefix, path2);
    if (typeof schemaOrHandler === "function") this.parent.post(fullPath, schemaOrHandler);
    else this.parent.post(fullPath, schemaOrHandler, handler, meta);
    return this;
  }
  put(path2, schemaOrHandler, handler, meta) {
    const fullPath = joinRoutePaths(this.prefix, path2);
    if (typeof schemaOrHandler === "function") this.parent.put(fullPath, schemaOrHandler);
    else this.parent.put(fullPath, schemaOrHandler, handler, meta);
    return this;
  }
  patch(path2, schemaOrHandler, handler, meta) {
    const fullPath = joinRoutePaths(this.prefix, path2);
    if (typeof schemaOrHandler === "function") this.parent.patch(fullPath, schemaOrHandler);
    else this.parent.patch(fullPath, schemaOrHandler, handler, meta);
    return this;
  }
  delete(path2, schemaOrHandler, handler, meta) {
    const fullPath = joinRoutePaths(this.prefix, path2);
    if (typeof schemaOrHandler === "function") this.parent.delete(fullPath, schemaOrHandler);
    else this.parent.delete(fullPath, schemaOrHandler, handler, meta);
    return this;
  }
  /** Create a nested runtime group while preserving normalized paths. */
  group(prefix, fn) {
    fn(new _KozoGroup(joinRoutePaths(this.prefix, prefix), this.parent));
    return this;
  }
};
var Kozo = class _Kozo {
  app;
  services;
  _scope;
  routes = [];
  /** Deferred uWS route data — compiled lazily only when nativeListen() is called. */
  _deferredUws = [];
  shutdownManager = new ShutdownManager();
  _routesDir;
  _wsRoutes = [];
  _onStart;
  _onStop;
  _maxBodyBytes;
  _logger;
  _onError;
  _onNotFound;
  _allowUnenforcedResponse;
  /** Async plugin installs queued by use() — flushed before the server binds. */
  _pendingPluginInstalls = [];
  /** Normalize bare Zod response schema → { 200: schema } for OpenAPI generators */
  static normalizeSchema(schema) {
    if (schema.response && typeof schema.response.parse === "function") {
      return { ...schema, response: { 200: schema.response } };
    }
    return schema;
  }
  constructor(config = {}) {
    this.app = new Hono();
    this.services = config.services ?? {};
    this._routesDir = config.routesDir;
    this._onStart = config.onStart;
    this._onStop = config.onStop;
    this._maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES2;
    this._logger = config.logger !== false;
    this._onError = config.onError;
    this._onNotFound = config.onNotFound;
    this._allowUnenforcedResponse = config.dangerouslyAllowUnenforcedResponse === true;
    if (config.scopedServices) {
      this._scope = {
        base: this.services,
        factory: config.scopedServices,
        onEnd: config.onRequestEnd
      };
    }
    this.app.onError((err, c) => {
      const hook = this._onError;
      if (hook) {
        try {
          const custom = hook(err, c);
          if (custom instanceof Response) return custom;
          if (custom != null && typeof custom.then === "function") {
            return custom;
          }
        } catch (hookErr) {
          console.error("[Kozo] onError hook failed:", hookErr);
        }
      }
      if (err instanceof KozoError) {
        return err.toResponse(c.req.path);
      }
      console.error("[Kozo] Unhandled error:", err);
      return internalErrorResponse(err, c.req.path);
    });
    this.app.notFound((c) => {
      const hook = this._onNotFound;
      if (hook) {
        try {
          const custom = hook(c);
          if (custom instanceof Response) return custom;
          if (custom != null && typeof custom.then === "function") {
            return custom;
          }
        } catch (hookErr) {
          console.error("[Kozo] onNotFound hook failed:", hookErr);
        }
      }
      return notFoundResponse(c.req.path);
    });
  }
  // Plugin system
  use(plugin) {
    try {
      const result = plugin.install(this);
      if (result != null && typeof result.then === "function") {
        this._pendingPluginInstalls.push(result);
      }
    } catch (err) {
      console.error(`[Kozo] Plugin "${plugin.name}" install failed:`, err);
      throw err;
    }
    return this;
  }
  /** Await all async plugin installs registered via use(). Called before bind. */
  async flushPluginInstalls() {
    if (this._pendingPluginInstalls.length === 0) return;
    const pending = this._pendingPluginInstalls;
    this._pendingPluginInstalls = [];
    await Promise.all(pending);
  }
  /**
   * Load routes from the file system using the configured routesDir.
   * Each route file is dynamically imported, its schema compiled, and handler registered.
   *
   * Also scans for `_middleware.ts` files in each directory and registers them
   * as scoped Hono middleware (parent directories run first):
   *
   *   routes/_middleware.ts        → applies to all routes
   *   routes/admin/_middleware.ts  → applies to /admin/* routes only
   *
   * This is a no-op if routesDir is not configured.
   */
  async loadRoutes(routesDir) {
    const dir = routesDir ?? this._routesDir;
    if (!dir) return this;
    const middlewares = await scanMiddleware({ routesDir: dir, verbose: false });
    for (const mw of middlewares) {
      this.app.use(mw.pathPrefix, mw.handler);
      this._middlewarePatterns.push(mw.pathPrefix);
    }
    const routes = await scanRoutes({ routesDir: dir, verbose: false });
    const compiled = await Promise.all(
      routes.map(async (route) => {
        const { path: path2, method, module } = route;
        const resolved = resolveRouteModule(module);
        const { handler, schema, meta } = resolved;
        const normalizedSchema = _Kozo.normalizeSchema(schema);
        const compiledSchema = SchemaCompiler.compile(normalizedSchema, {
          route: `${method.toUpperCase()} ${path2}`,
          dangerouslyAllowUnenforcedResponse: this._allowUnenforcedResponse
        });
        return { path: path2, method, handler, normalizedSchema, meta, compiledSchema };
      })
    );
    for (const { path: path2, method, handler, normalizedSchema, meta, compiledSchema } of compiled) {
      const optimizedHandler = compileRouteHandler(
        (ctx) => handler(ctx),
        normalizedSchema,
        this.services,
        compiledSchema,
        this._scope,
        this._onError
      );
      this.routes.push({ method, path: path2, schema: normalizedSchema, meta });
      this.app[method](path2, optimizedHandler);
      const paramNames = [];
      path2.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return name;
      });
      this._deferredUws.push({ method: method.toUpperCase(), path: path2, paramNames, handler: (ctx) => handler(ctx), schema: normalizedSchema, compiled: compiledSchema });
    }
    return this;
  }
  generateClient(baseUrlOrOptions) {
    const options = typeof baseUrlOrOptions === "string" ? { baseUrl: baseUrlOrOptions } : baseUrlOrOptions || {};
    const routeInfos = this.routes.map((r) => ({
      method: r.method,
      path: r.path,
      schema: r.schema
    }));
    return generateTypedClient(routeInfos, options);
  }
  get(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") {
      return this.register("get", path2, {}, schemaOrHandler);
    }
    return this.register("get", path2, schemaOrHandler, handler, meta);
  }
  post(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") {
      return this.register("post", path2, {}, schemaOrHandler);
    }
    return this.register("post", path2, schemaOrHandler, handler, meta);
  }
  put(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") {
      return this.register("put", path2, {}, schemaOrHandler);
    }
    return this.register("put", path2, schemaOrHandler, handler, meta);
  }
  patch(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") {
      return this.register("patch", path2, {}, schemaOrHandler);
    }
    return this.register("patch", path2, schemaOrHandler, handler, meta);
  }
  delete(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") {
      return this.register("delete", path2, {}, schemaOrHandler);
    }
    return this.register("delete", path2, schemaOrHandler, handler, meta);
  }
  /**
   * Group routes under a common path prefix.
   *
   * @example
   * app.group('/users', (r) => {
   *   r.get('/',    { query: paginationSchema }, (ctx) => listUsers(ctx.query));
   *   r.get('/:id', { params: uuidParams },     (ctx) => getUser(ctx.params.id));
   *   r.post('/',   { body: CreateUserSchema }, (ctx) => createUser(ctx.body));
   * });
   */
  group(prefix, fn) {
    fn(new KozoGroup(joinRoutePaths("", prefix), this));
    return this;
  }
  /**
   * Register a statically typed route contract below a path prefix.
   *
   * The returned value carries the mounted route union for contract-aware
   * tooling. Capture it through chaining or assignment.
   */
  mount(prefix, contract) {
    for (const route of getContractRouteRegistrations(
      contract
    )) {
      this.register(
        route.method,
        joinRoutePaths(prefix, route.path),
        route.schema,
        route.handler,
        route.meta
      );
    }
    return this;
  }
  /**
   * Register a WebSocket endpoint (requires `nativeListen()` with uWebSockets.js).
   *
   * @example
   * app.ws('/ws/chat', {
   *   open(ws)  { ws.subscribe('chat'); },
   *   message(ws, data) { ws.publish('chat', data); },
   * });
   *
   * // With typed user data and auth:
   * app.ws<{ userId: string }>('/ws/secure', {
   *   upgrade(req) {
   *     const userId = verifyToken(req.headers['authorization']);
   *     return userId ? { userId } : false;
   *   },
   *   open(ws) { console.log(ws.data.userId, 'connected'); },
   * });
   */
  ws(path2, handler) {
    this._wsRoutes.push({ path: path2, handler });
    return this;
  }
  register(method, path2, schema, handler, meta) {
    const normalizedSchema = _Kozo.normalizeSchema(schema);
    this.routes.push({ method, path: path2, schema: normalizedSchema, meta });
    const compiled = SchemaCompiler.compile(normalizedSchema, {
      route: `${method.toUpperCase()} ${path2}`,
      dangerouslyAllowUnenforcedResponse: this._allowUnenforcedResponse
    });
    const optimizedHandler = compileRouteHandler(
      handler,
      normalizedSchema,
      this.services,
      compiled,
      this._scope,
      this._onError
    );
    this.app[method](path2, optimizedHandler);
    const paramNames = [];
    path2.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return name;
    });
    this._deferredUws.push({ method: method.toUpperCase(), path: path2, paramNames, handler, schema: normalizedSchema, compiled });
    return this;
  }
  /**
   * Start a uWebSockets.js HTTP server.
   *
   * All routes are registered directly with uWS's C++ radix trie router —
   * zero JS routing overhead per request. The C++ HTTP parser (µHttpParser)
   * eliminates all IncomingMessage/ServerResponse allocations.
   *
   * Throws if uWebSockets.js is not installed.
   * Returns { port, server } so callers can close the server when done.
   */
  async nativeListen(portOrOptions) {
    await this.flushPluginInstalls();
    const opts = typeof portOrOptions === "number" ? { port: portOrOptions } : portOrOptions ?? {};
    const port = opts.port ?? 3e3;
    const uwsBindings = await tryLoadUws();
    if (!uwsBindings) {
      throw new Error(
        "[Kozo] uWebSockets.js is required but not installed.\nIt is published on GitHub, not npm \u2014 install it with:\n  pnpm add uNetworking/uWebSockets.js#v20.66.0"
      );
    }
    const manager = this.shutdownManager;
    const patterns = this._middlewarePatterns;
    const honoFetch = this.app.fetch;
    let bridgedCount = 0;
    let guardedCount = 0;
    const uwsRoutes = this._deferredUws.map((r) => {
      if (patterns.some((p) => middlewarePatternOverlaps(p, r.path))) {
        bridgedCount++;
        return {
          method: r.method,
          path: r.path,
          paramNames: r.paramNames,
          handler: makeUwsHonoBridge(r.method, honoFetch)
        };
      }
      const native = compileUwsNativeHandler(r.handler, r.schema, this.services, r.compiled, this._scope, this._maxBodyBytes, r.method);
      const guards = this._guards.filter((g) => middlewarePatternOverlaps(g.pattern, r.path));
      if (guards.length === 0) {
        return { method: r.method, path: r.path, paramNames: r.paramNames, handler: native };
      }
      guardedCount++;
      return {
        method: r.method,
        path: r.path,
        paramNames: r.paramNames,
        handler: wrapNativeWithGuards(compileGuards(guards), native, r.method)
      };
    });
    if (this._logger && (bridgedCount > 0 || guardedCount > 0)) {
      const parts = [];
      if (guardedCount > 0) parts.push(`${guardedCount} native+guards`);
      if (bridgedCount > 0) parts.push(`${bridgedCount} Hono-bridged (app.middleware / _middleware.ts)`);
      console.log(`[Kozo] routes: ${parts.join(", ")}, ${uwsRoutes.length - bridgedCount - guardedCount} pure native of ${uwsRoutes.length}`);
    }
    this._deferredUws.length = 0;
    const result = await createUwsServer({
      uws: uwsBindings,
      routes: uwsRoutes,
      port,
      cors: opts.cors,
      isShuttingDown: () => manager.isShuttingDown(),
      trackRequest: () => manager.trackRequest(),
      wsRoutes: this._wsRoutes.length > 0 ? this._wsRoutes : void 0,
      maxBodyBytes: this._maxBodyBytes
    });
    manager.setServer(result.server);
    if (this._logger) {
      if (this._wsRoutes.length > 0) {
        console.log(`\u{1F680} uWebSockets.js transport active (HTTP + ${this._wsRoutes.length} WebSocket route${this._wsRoutes.length > 1 ? "s" : ""})`);
      } else {
        console.log("\u{1F680} uWebSockets.js transport active (C++ HTTP parser + native radix router)");
      }
    }
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }
    return result;
  }
  async listen(port) {
    await this.flushPluginInstalls();
    if (this._wsRoutes.length > 0) {
      console.warn("[Kozo] WebSocket routes require nativeListen() (uWebSockets.js). They will be ignored with listen().");
    }
    const finalPort = port ?? 3e3;
    const manager = this.shutdownManager;
    const originalFetch = this.app.fetch;
    let shutdownStarted = false;
    manager.onShutdownStart(() => {
      shutdownStarted = true;
    });
    let resolveListening;
    const listening = new Promise((r) => {
      resolveListening = r;
    });
    const server = serve({
      fetch: (req, ...args) => {
        const contentLength = req.headers.get("content-length");
        if (contentLength !== null && Number(contentLength) > this._maxBodyBytes) {
          return new Response(bodyTooLargeJson(this._maxBodyBytes), {
            status: 413,
            headers: { "Content-Type": "application/problem+json" }
          });
        }
        if (!shutdownStarted) {
          const untrack2 = manager.trackRequest();
          try {
            return originalFetch(req, ...args);
          } finally {
            untrack2();
          }
        }
        if (manager.isShuttingDown()) {
          return new Response(
            JSON.stringify({
              type: "about:blank",
              title: "Service Unavailable",
              status: 503,
              detail: "Server is shutting down, please retry later"
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/problem+json" }
            }
          );
        }
        const untrack = manager.trackRequest();
        try {
          return originalFetch(req, ...args);
        } finally {
          untrack();
        }
      },
      port: finalPort
    }, (info) => resolveListening(info.port));
    manager.setServer(server);
    const boundPort = await listening;
    if (this._logger) {
      console.log(`\u{1F680} Kozo server listening on http://localhost:${boundPort}`);
    }
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }
    return { port: boundPort, server };
  }
  /**
   * Start a unified server that handles both API routes and SSR-rendered pages.
   *
   * API routes (matching `ssrConfig.apiPrefix`, default `/api`) are routed
   * through Hono. All other requests go through the Vite SSR pipeline:
   * - Dev:  Vite middleware for HMR + optional SSR rendering
   * - Prod: Static file serving + SSR template rendering
   *
   * This eliminates the need for a separate frontend server and API proxy.
   *
   * @example
   * const app = createKozo({ routesDir: './src/routes' });
   * await app.loadRoutes();
   *
   * await app.listenSsr(3000, {
   *   root: path.resolve(__dirname, '../web'),
   *   entryServer: 'src/entry-server.tsx',
   * });
   */
  async listenSsr(port, ssrConfig) {
    await this.flushPluginInstalls();
    const manager = this.shutdownManager;
    const originalFetch = this.app.fetch;
    let shutdownStarted = false;
    manager.onShutdownStart(() => {
      shutdownStarted = true;
    });
    const shutdownFetch = (req, ...args) => {
      const contentLength = req.headers.get("content-length");
      if (contentLength !== null && Number(contentLength) > this._maxBodyBytes) {
        return new Response(bodyTooLargeJson(this._maxBodyBytes), {
          status: 413,
          headers: { "Content-Type": "application/problem+json" }
        });
      }
      if (!shutdownStarted) {
        const untrack2 = manager.trackRequest();
        try {
          return originalFetch(req, ...args);
        } finally {
          untrack2();
        }
      }
      if (manager.isShuttingDown()) {
        return new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            detail: "Server is shutting down, please retry later"
          }),
          { status: 503, headers: { "Content-Type": "application/problem+json" } }
        );
      }
      const untrack = manager.trackRequest();
      try {
        return originalFetch(req, ...args);
      } finally {
        untrack();
      }
    };
    const { getRequestListener } = await import("@hono/node-server");
    const honoHandler = getRequestListener(shutdownFetch);
    const result = await createSsrServer({ logger: this._logger, ...ssrConfig }, honoHandler, port);
    manager.setServer(result.server);
    return result;
  }
  /**
   * Graceful shutdown — drains in-flight requests before closing.
   * Calls `onStop` lifecycle hook after draining and internal cleanup.
   * Use getShutdownManager().setDatabase(db, provider) to register DB cleanup.
   */
  async shutdown(options) {
    clearRateLimitStore();
    await this.shutdownManager.shutdown(options);
    if (this._onStop) {
      try {
        await this._onStop({ services: this.services });
      } catch (err) {
        console.error("[Kozo] onStop hook error:", err);
      }
    }
  }
  getShutdownManager() {
    return this.shutdownManager;
  }
  getApp() {
    return this.app;
  }
  /**
   * Register a Hono middleware on the app.
   *
   * Patterns are tracked so `nativeListen()` can bridge any covered route
   * through the Hono pipeline (auth, rate limits, CORS, `_middleware.ts`, …).
   *
   * NOTE: bridged routes lose the zero-shim uWS fast path. For cross-cutting
   * security (auth, rate limits, role checks) prefer {@link guard} — it runs
   * the same check on both transports at native speed. Use `middleware()`
   * only for logic that genuinely needs the Hono `Context`.
   *
   * @example
   * app.middleware('/api/*', async (c, next) => {
   *   c.set('user', await verifyJwt(c.req.header('authorization')));
   *   return next();
   * });
   */
  _middlewarePatterns = [];
  middleware(pathOrHandler, handler) {
    if (typeof pathOrHandler === "string") {
      this.app.use(pathOrHandler, handler);
      this._middlewarePatterns.push(pathOrHandler);
    } else {
      this.app.use(pathOrHandler);
      this._middlewarePatterns.push("*");
    }
    return this;
  }
  /**
   * Guards registered via {@link guard}. Unlike `_middlewarePatterns`, these
   * do NOT force routes through the Hono bridge under `nativeListen()` —
   * they are compiled directly into the uWS fast path.
   */
  _guards = [];
  /**
   * Register a transport-agnostic guard (auth, rate-limit, …).
   *
   * The same guard function runs on BOTH transports:
   * - `listen()`        → as a Hono middleware
   * - `nativeListen()`  → compiled into the zero-shim uWS path (no Hono,
   *                       no Request/Response allocation — native speed)
   *
   * This is the recommended way to protect routes when using the uWS
   * transport: `app.middleware()` forces covered routes through the Hono
   * bridge, `app.guard()` does not.
   *
   * @example
   * app.guard('/api/*', async (req) => {
   *   const token = req.header('authorization')?.slice(7);
   *   if (!token) return { deny: { status: 401 } };
   *   const user = await verifyJwt(token);
   *   return user ? { user } : { deny: { status: 401 } };
   * });
   */
  guard(pattern, guard) {
    this._guards.push({ pattern, guard });
    this.app.use(pattern, guardToHonoMiddleware(guard));
    return this;
  }
  /**
   * Returns all registered routes (file-system + manual) after {@link loadRoutes} completes.
   * Use this to inspect `meta.auth`, `meta.tags`, etc. at runtime.
   *
   * @example
   * await app.loadRoutes();
   * const publicRoutes = app.getRoutes().filter(r => r.meta?.auth === false);
   */
  getRoutes() {
    return this.routes;
  }
  /**
   * Mounts Swagger UI + the OpenAPI 3.1 spec of every registered route.
   *
   * Safe by default: outside `NODE_ENV=production` the docs are on; in
   * production they are NOT mounted unless `enabled: true` is passed
   * explicitly. The spec is generated lazily on the first request (and then
   * cached), so `mountDocs()` can be called before or after `loadRoutes()`
   * and works with `listen()` and `nativeListen()` alike.
   *
   * Both routes carry `meta.auth: false`; auth layers that scan route files
   * (e.g. `@kozojs/auth`'s `registerAuthBeforeLoadRoutes`) still need the two
   * paths in `extraPublicPaths`.
   *
   * @example
   * app.mountDocs({ title: 'my-api', version: '1.0.0', path: '/api/docs' });
   * // production opt-in:
   * app.mountDocs({ enabled: env.ENABLE_DOCS });
   */
  mountDocs(options = {}) {
    const enabled = options.enabled ?? process.env.NODE_ENV !== "production";
    if (!enabled) return this;
    const uiPath = options.path ?? "/docs";
    const specPath = `${uiPath}.json`;
    const info = {
      title: options.title ?? "API",
      version: options.version ?? "0.0.0",
      description: options.description
    };
    let cachedSpec = null;
    const buildSpec = () => {
      if (cachedSpec) return cachedSpec;
      const apiRoutes = this.getRoutes().filter(
        (r) => r.path !== uiPath && r.path !== specPath
      );
      const seen = /* @__PURE__ */ new Set();
      const tags = apiRoutes.map((r) => r.meta?.tags?.[0] ?? docsRouteTag(r.path)).filter((name) => !seen.has(name) && seen.add(name)).map((name) => ({ name, description: `${name} endpoints` }));
      const definitions = apiRoutes.map((r) => ({
        path: r.path,
        method: r.method,
        filePath: r.path,
        module: {
          default: () => void 0,
          schema: r.schema,
          meta: { ...r.meta, tags: r.meta?.tags ?? [docsRouteTag(r.path)] }
        }
      }));
      cachedSpec = createOpenAPIGenerator({ info, servers: options.servers, tags }).generate(definitions);
      return cachedSpec;
    };
    this.get(uiPath, {}, (ctx) => ctx.html(generateSwaggerHtml(specPath, info.title)), {
      auth: false,
      summary: "API documentation (Swagger UI)"
    });
    this.get(specPath, {}, (ctx) => ctx.json(buildSpec()), {
      auth: false,
      summary: "OpenAPI 3.1 specification"
    });
    return this;
  }
  get fetch() {
    return this.app.fetch;
  }
};
function createKozo(config) {
  return new Kozo(config);
}

// src/kozo-app.ts
function defineKozoApp(options) {
  const { routesDir = "./src/routes", services, types, configure, onReady, ...kozo } = options;
  const definition = {
    routesDir,
    services,
    types,
    configure,
    onReady,
    kozo,
    build: () => buildKozoApp(definition)
  };
  return definition;
}
async function buildKozoApp(definition) {
  const resolved = await definition.services();
  const app = createKozo({
    ...definition.kozo,
    routesDir: definition.routesDir,
    services: resolved
  });
  if (definition.configure) {
    await definition.configure({ app, services: resolved });
  }
  await app.loadRoutes();
  if (definition.onReady) {
    await definition.onReady({ app });
  }
  return app;
}
async function renderKozoTypesDts(types, projectRoot) {
  const path2 = await import("path");
  const from = path2.join(projectRoot, ".kozo", "types.d.ts");
  const to = path2.join(projectRoot, types.from);
  let rel = path2.relative(path2.dirname(from), to).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  const importPath = rel.replace(/\.ts$/, ".js");
  return `// Auto-generated by Kozo \u2014 do not edit.
import type { ${types.name} } from '${importPath}';

declare module '@kozojs/core' {
  interface KozoServices extends ${types.name} {}
}
`;
}
var KOZO_TYPES_CANDIDATES = [
  "src/kozo.types.ts",
  "src/kozo.types.js",
  "kozo.types.ts"
];
var KOZO_CONFIG_CANDIDATES = [
  "kozo.config.ts",
  "kozo.config.js",
  "src/kozo.config.ts",
  "src/kozo.config.js"
];
var KOZO_TYPES_OUTPUT = ".kozo/types.d.ts";

// src/types.ts
function defineRoute(options) {
  return options;
}
function createRouteFactory() {
  return {
    defineRoute(options) {
      return options;
    }
  };
}

// src/index.ts
import { z as z4 } from "zod";

// src/middleware/logger.ts
function sanitizeForLog(input) {
  return input.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\x1b/g, "\\x1b");
}
function logger(options = {}) {
  const { prefix = "\u{1F310}", colorize = true } = options;
  return async (c, next) => {
    const start = Date.now();
    const method = sanitizeForLog(c.req.method);
    const path2 = sanitizeForLog(c.req.path);
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    const statusColor = status >= 500 ? "\u{1F534}" : status >= 400 ? "\u{1F7E1}" : "\u{1F7E2}";
    const log = `${prefix} ${method.padEnd(6)} ${path2} ${statusColor} ${status} ${duration}ms`;
    console.log(log);
  };
}

// src/middleware/cors.ts
import { cors as honoCors } from "hono/cors";
function cors(options = {}) {
  return honoCors({
    origin: options.origin || "*",
    allowMethods: options.allowMethods || ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: options.allowHeaders || ["Content-Type", "Authorization"],
    exposeHeaders: options.exposeHeaders || [],
    maxAge: options.maxAge || 86400,
    credentials: options.credentials || false
  });
}

// src/middleware/error-handler.ts
function errorHandler() {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof KozoError) {
        return err.toResponse(c.req.path);
      }
      console.error("Unhandled error:", err);
      return c.json({
        error: "Internal Server Error",
        status: 500
      }, 500);
    }
  };
}

// src/middleware/fileSystemRouting.ts
import { readFile } from "fs/promises";
import { resolve } from "path";
import { pathToFileURL as pathToFileURL3 } from "url";
async function readManifest(manifestPath, onMissing) {
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    onMissing(err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}
async function importHandler(handlerPath) {
  try {
    const url = handlerPath.startsWith("file://") ? handlerPath : pathToFileURL3(handlerPath).href;
    const mod = await import(url);
    if (typeof mod.default !== "function") {
      console.warn(
        `[kozo:fsr] Skipping ${handlerPath}: no default export function`
      );
      return null;
    }
    return mod.default;
  } catch (err) {
    console.warn(
      `[kozo:fsr] Failed to import handler ${handlerPath}:`,
      err.message
    );
    return null;
  }
}
async function applyFileSystemRouting(app, options = {}) {
  const {
    manifestPath = resolve(process.cwd(), "routes-manifest.json"),
    verbose = false,
    onMissingManifest = () => {
    },
    logger: logger2 = console.log
  } = options;
  const manifest = await readManifest(manifestPath, onMissingManifest);
  if (!manifest) return;
  const log = logger2;
  if (verbose) {
    log(
      `
\u{1F4CB} [kozo:fsr] Loading ${manifest.routes.length} route(s) from manifest
`
    );
  }
  for (const route of manifest.routes) {
    const handler = await importHandler(route.handler);
    if (!handler) continue;
    app[route.method](route.path, handler);
    if (verbose) {
      log(
        `   ${route.method.toUpperCase().padEnd(6)} ${route.path}  \u2192  ${route.handler}`
      );
    }
  }
  if (verbose) {
    log("");
  }
}
function createFileSystemRouting(options = {}) {
  return (app) => applyFileSystemRouting(app, options);
}

// src/middleware/webhook-verify.ts
import { createHmac, timingSafeEqual } from "crypto";
function verifyWebhookSignature(options) {
  const {
    secret,
    algorithm = "sha256",
    headerName = "x-webhook-signature"
  } = options;
  return async (c, next) => {
    const signature = c.req.header(headerName);
    if (!signature) {
      return c.json(
        {
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          detail: `Missing required header: ${headerName}`
        },
        401
      );
    }
    const prefix = `${algorithm}=`;
    const hexDigest = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;
    const body = await c.req.text();
    const expected = createHmac(algorithm, secret).update(body).digest("hex");
    let signaturesMatch;
    try {
      signaturesMatch = timingSafeEqual(
        Buffer.from(hexDigest, "hex"),
        Buffer.from(expected, "hex")
      );
    } catch {
      signaturesMatch = false;
    }
    if (!signaturesMatch) {
      return c.json(
        {
          type: "about:blank",
          title: "Forbidden",
          status: 403,
          detail: "Webhook signature verification failed"
        },
        403
      );
    }
    await next();
  };
}

// src/helpers.ts
import { z as z3 } from "zod";
import { randomUUID } from "crypto";

// src/weak-secrets.ts
import { createHash } from "crypto";
var MIN_SECRET_BYTES = 32;
var GENERATE_SECRET_COMMAND = `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`;
var KNOWN_WEAK_SECRETS = /* @__PURE__ */ new Set([
  // Tier 1 — shipped in @kozojs/cli <= 0.5.21
  "dev-secret-must-be-at-least-32-characters-long",
  "change-me-to-a-random-secret-at-least-32-chars",
  "change-me-to-a-random-secret",
  "change-me-in-production",
  "change-me",
  // Tier 2 — documentation placeholders
  "my-secret-key",
  "your-secret-key"
]);
function isKnownWeakSecret(value) {
  return KNOWN_WEAK_SECRETS.has(value);
}
function secretByteLength(value) {
  return Buffer.byteLength(value, "utf8");
}
var warned = /* @__PURE__ */ new Set();
function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
function hint() {
  return `  Generate one:  ${GENERATE_SECRET_COMMAND}`;
}
function assertStrongSecret(value, options) {
  const { source, minBytes = MIN_SECRET_BYTES, onShort = "auto" } = options;
  const knownWeak = typeof value === "string" ? isKnownWeakSecret(value) : [...KNOWN_WEAK_SECRETS].some(
    (weak) => Buffer.from(weak, "utf8").equals(Buffer.from(value))
  );
  if (knownWeak) {
    throw new Error(
      `[Kozo] ${source} is set to a secret that ships publicly with Kozo.
  That value is in the published packages, so anyone can forge a token for this service \u2014 including an admin one.
  Rotate it now; tokens signed with the old secret must be treated as compromised.
` + hint()
    );
  }
  const bytes = typeof value === "string" ? secretByteLength(value) : value.byteLength;
  if (bytes >= minBytes) return;
  const problem = bytes === 0 ? `${source} is empty` : `${source} is ${bytes} byte${bytes === 1 ? "" : "s"} long; at least ${minBytes} are required`;
  if (bytes === 0 || onShort === "throw" || process.env.NODE_ENV === "production") {
    throw new Error(`[Kozo] ${problem}.
${hint()}`);
  }
  const id = fingerprint(value);
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(
    `[Kozo] Warning: ${problem}.
  This is tolerated because NODE_ENV is not 'production'. It will throw there.
` + hint()
  );
}

// src/helpers.ts
function defineEnv(shape) {
  const schema = z3.object(shape);
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`[Kozo] Invalid environment variables:
${errors}`);
  }
  return result.data;
}
function requireSecret(name, options = {}) {
  const { minBytes = MIN_SECRET_BYTES } = options;
  const value = process.env[name];
  if (value === void 0) {
    throw new Error(
      `[Kozo] Missing required environment variable: ${name}
  It must be at least ${minBytes} bytes and must not be shared or committed.
  Generate one:  ${GENERATE_SECRET_COMMAND}`
    );
  }
  assertStrongSecret(value, { source: name, minBytes, onShort: "throw" });
  return value;
}
function paginate(items, page, limit) {
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit),
    hasNext: start + limit < items.length,
    hasPrev: page > 1
  };
}
function uuid() {
  return randomUUID();
}
var paginationSchema = z3.object({
  page: z3.coerce.number().int().min(1).default(1),
  limit: z3.coerce.number().int().min(1).max(100).default(10)
});
var uuidParams = z3.object({
  id: z3.string().uuid()
});
var idParams = z3.object({
  id: z3.coerce.number().int().positive()
});
var timestamps = z3.object({
  createdAt: z3.date(),
  updatedAt: z3.date()
});
var sortSchema = z3.object({
  sortBy: z3.string().optional(),
  sortOrder: z3.enum(["asc", "desc"]).default("asc")
});
var searchSchema = z3.object({
  q: z3.string().optional()
});
var successSchema = z3.object({
  success: z3.boolean(),
  message: z3.string().optional()
});
var deletedSchema = z3.object({
  success: z3.boolean(),
  deletedId: z3.string()
});
export {
  BadRequestError,
  ConflictError,
  ERROR_RESPONSES,
  ForbiddenError,
  GENERATE_SECRET_COMMAND,
  GoneError,
  KNOWN_WEAK_SECRETS,
  KOZO_CONFIG_CANDIDATES,
  KOZO_TYPES_CANDIDATES,
  KOZO_TYPES_OUTPUT,
  Kozo,
  KozoError,
  KozoGroup,
  MIN_SECRET_BYTES,
  NotFoundError,
  OpenAPIGenerator,
  RouteContract,
  SchemaCompiler,
  ShutdownManager,
  UnauthorizedError,
  ValidationFailedError,
  applyFileSystemRouting,
  assertStrongSecret,
  buildKozoApp,
  buildNativeContext,
  clearRateLimitStore,
  compileGuardPattern,
  compileRouteHandler,
  cors,
  createFileSystemRouting,
  createInflightTracker,
  createKozo,
  createOpenAPIGenerator,
  createRouteFactory,
  createRouter,
  createShutdownManager,
  createSsrServer,
  defineEnv,
  defineKozoApp,
  defineRoute,
  defineRoutes,
  deletedSchema,
  errorHandler,
  fastCL,
  fastWrite400,
  fastWrite404,
  fastWrite500,
  fastWriteError,
  fastWriteHtml,
  fastWriteJson,
  fastWriteJsonStatus,
  fastWriteText,
  fileToPath,
  forbiddenResponse,
  formatZodErrors,
  generateSwaggerHtml,
  generateTypedClient,
  guardToHonoMiddleware,
  idParams,
  internalErrorResponse,
  isKnownWeakSecret,
  isMiddlewareFile,
  isRouteFile,
  logger,
  notFoundResponse,
  paginate,
  paginationSchema,
  rateLimit,
  rateLimitGuard,
  renderKozoTypesDts,
  requireSecret,
  resolveClientIp,
  resolveRouteModule,
  scanMiddleware,
  scanRoutes,
  searchSchema,
  secretByteLength,
  sortSchema,
  successSchema,
  timestamps,
  trackRequest,
  unauthorizedResponse,
  uuid,
  uuidParams,
  validationErrorResponse,
  verifyWebhookSignature,
  z4 as z
};
