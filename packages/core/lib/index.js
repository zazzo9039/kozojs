// src/app.ts
import { Hono } from "hono/quick";
import { serve } from "@hono/node-server";

// src/client-generator.ts
function generateMethodName(method, path2) {
  const cleanPath = path2.replace(/^\/+|\/+$/g, "");
  const withParams = cleanPath.replace(/:(\w+)/g, "By$1");
  const safeName = withParams.replace(/[\/\-\.]/g, "_").replace(/[^\w]/g, "");
  if (method.toLowerCase() !== "get") {
    return method.toLowerCase() + safeName.charAt(0).toUpperCase() + safeName.slice(1);
  }
  return safeName || "index";
}
function extractPathParams(path2) {
  const matches = path2.match(/:(\w+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
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
  for (const route of routes) {
    const methodName = generateMethodName(route.method, route.path);
    const pathParams = extractPathParams(route.path);
    let paramsType = "void";
    let bodyType = "void";
    let queryType = "void";
    let responseType = "unknown";
    if (pathParams.length > 0) {
      paramsType = `{ ${pathParams.map((p) => `${p}: string`).join("; ")} }`;
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
        const zodSchema = raw && typeof raw === "object" && !raw._def ? raw[200] ?? raw : raw;
        const src = zodToString(zodSchema);
        schemaExports.push(`export const ${schemaVarName} = ${src};`);
      }
    }
    if (bodyType !== "void" && !bodyType.includes("z.infer")) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Body = ${bodyType};`);
    }
    if (queryType !== "void" && !queryType.includes("z.infer")) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Query = ${queryType};`);
    }
    if (!responseType.includes("z.infer")) {
      typeDefinitions.push(`export type ${capitalize(methodName)}Response = ${responseType};`);
    }
    const args = [];
    if (paramsType !== "void") args.push(`params: ${paramsType}`);
    if (bodyType !== "void") args.push(`body: ${bodyType}`);
    if (queryType !== "void") args.push(`query?: ${queryType}`);
    const argsStr = args.join(", ");
    const returnType = `Promise<${responseType}>`;
    let methodBody = `  async ${methodName}(${argsStr}): ${returnType} {
`;
    if (includeValidation && bodyType !== "void") {
      const schemaVar = schemaVars.get(`${methodName}_body`);
      if (schemaVar) {
        methodBody += `    if (this.validateRequests && ${schemaVar}) {
`;
        methodBody += `      ${schemaVar}.parse(body);
`;
        methodBody += `    }
`;
      }
    }
    let urlExpression = `\`\${this.baseUrl}${route.path}\``;
    if (pathParams.length > 0) {
      const pathWithParams = route.path.replace(/:(\w+)/g, "${params.$1}");
      urlExpression = `\`\${this.baseUrl}${pathWithParams}\``;
    }
    methodBody += `    let url = ${urlExpression};
`;
    if (queryType !== "void") {
      methodBody += `    if (query) {
`;
      methodBody += `      const queryString = new URLSearchParams(query as any).toString();
`;
      methodBody += `      url += \`?\${queryString}\`;
`;
      methodBody += `    }
`;
    }
    methodBody += `    const options: RequestInit = {
`;
    methodBody += `      method: '${route.method.toUpperCase()}',
`;
    methodBody += `      headers: { ...this.defaultHeaders, 'Content-Type': 'application/json' },
`;
    if (bodyType !== "void") {
      methodBody += `      body: JSON.stringify(body),
`;
    }
    methodBody += `    };
`;
    methodBody += `    const response = await fetch(url, options);
`;
    methodBody += `    if (!response.ok) {
`;
    methodBody += `      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
`;
    methodBody += `    }
`;
    methodBody += `    return response.json();
`;
    methodBody += `  }
`;
    methodImplementations.push(methodBody);
  }
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
  code += `export interface KozoClientOptions {
`;
  code += `  baseUrl?: string;
`;
  code += `  validateRequests?: boolean;
`;
  code += `  defaultHeaders?: Record<string, string>;
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
  code += `  constructor(options: KozoClientOptions = {}) {
`;
  code += `    this.baseUrl = options.baseUrl || '${baseUrl}';
`;
  code += `    this.validateRequests = options.validateRequests ?? ${validateByDefault};
`;
  code += `    this.defaultHeaders = options.defaultHeaders || ${JSON.stringify(defaultHeaders)};
`;
  code += `  }

`;
  code += methodImplementations.join("\n");
  code += `}

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
      const vals = def4?.entries ?? def3?.values;
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
      const vt = def4?.valueType ?? def3?.valueType;
      return `z.record(${zodToString(vt)})`;
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
var BODY_413 = JSON.stringify({
  type: "about:blank",
  title: "Payload Too Large",
  status: 413,
  detail: "Request body exceeds maximum allowed size"
});
var DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;
function uwsFastWriteJson(uwsRes, body, corsHeaders) {
  uwsRes.cork(() => {
    uwsRes.writeStatus("200 OK");
    uwsRes.writeHeader("Content-Type", CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(body);
  });
}
function uwsFastWriteJsonStatus(uwsRes, body, status, corsHeaders) {
  uwsRes.cork(() => {
    uwsRes.writeStatus(STATUS_TEXT[status] ?? `${status}`);
    uwsRes.writeHeader("Content-Type", CT_JSON);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(body);
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
  uwsRes.cork(() => {
    uwsRes.writeStatus("400 Bad Request");
    uwsRes.writeHeader("Content-Type", CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(body);
  });
}
function uwsFastWrite500(uwsRes, corsHeaders) {
  uwsRes.cork(() => {
    uwsRes.writeStatus("500 Internal Server Error");
    uwsRes.writeHeader("Content-Type", CT_PROBLEM);
    if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
    uwsRes.end(BODY_500);
  });
}
function uwsFastWriteError(err, uwsRes, corsHeaders) {
  if (err instanceof KozoError) {
    const body = JSON.stringify({
      type: `https://kozo-docs.vercel.app/docs/core/errors#${err.code}`,
      title: err.message,
      status: err.statusCode
    });
    uwsRes.cork(() => {
      uwsRes.writeStatus(STATUS_TEXT[err.statusCode] ?? `${err.statusCode}`);
      uwsRes.writeHeader("Content-Type", CT_PROBLEM);
      if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
      uwsRes.end(body);
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
function buildCorsHeaders(cfg) {
  const h = [
    ["Access-Control-Allow-Origin", cfg.origin ?? "*"],
    ["Access-Control-Allow-Methods", cfg.methods ?? "GET,POST,PUT,PATCH,DELETE,OPTIONS"],
    ["Access-Control-Allow-Headers", cfg.headers ?? "Content-Type,Authorization"]
  ];
  if (cfg.maxAge != null) h.push(["Access-Control-Max-Age", String(cfg.maxAge)]);
  if (cfg.credentials) h.push(["Access-Control-Allow-Credentials", "true"]);
  return h;
}
function wrapHandler(h, corsHeaders, isShuttingDown, trackRequest2) {
  if (!corsHeaders && !isShuttingDown && !trackRequest2) return h;
  return (uwsRes, url, rawBody, params) => {
    if (isShuttingDown?.()) {
      uwsRes.cork(() => {
        uwsRes.writeStatus("503 Service Unavailable");
        uwsRes.writeHeader("Content-Type", CT_PROBLEM);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end(BODY_503);
      });
      return;
    }
    const untrack = trackRequest2?.();
    if (!untrack) return h(uwsRes, url, rawBody, params, corsHeaders ?? void 0);
    try {
      const result = h(uwsRes, url, rawBody, params, corsHeaders ?? void 0);
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
      const remoteAddress = new TextDecoder().decode(ws.getRemoteAddressAsText());
      if (handler.open) handler.open(getOrCreateWrapper(ws, remoteAddress));
    },
    message(ws, message, isBinary) {
      if (handler.message) {
        const data = isBinary ? message : new TextDecoder().decode(message);
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
  const { uws, routes, cors: corsConfig, isShuttingDown, trackRequest: trackRequest2 } = opts;
  const port = opts.port === 0 ? await getFreePort() : opts.port;
  const emptyParams = Object.freeze({});
  const corsHeaders = corsConfig ? buildCorsHeaders(corsConfig) : null;
  return new Promise((resolve2, reject) => {
    const uwsApp = uws.App();
    if (corsHeaders) {
      uwsApp.options("/*", (uwsRes) => {
        uwsRes.cork(() => {
          uwsRes.writeStatus("204 No Content");
          for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
          uwsRes.end();
        });
      });
    }
    for (const route of routes) {
      const fn = UWS_METHOD[route.method];
      if (!fn) continue;
      const h = wrapHandler(route.handler, corsHeaders, isShuttingDown, trackRequest2);
      const names = route.paramNames;
      const hasParams = names.length > 0;
      const noBody = NO_BODY_METHODS.has(route.method);
      if (noBody && !hasParams) {
        uwsApp[fn](route.path, (uwsRes, uwsReq) => {
          const query = uwsReq.getQuery();
          h(uwsRes, query ? `${uwsReq.getUrl()}?${query}` : uwsReq.getUrl(), "", emptyParams);
        });
      } else if (noBody && hasParams) {
        uwsApp[fn](route.path, (uwsRes, uwsReq) => {
          const rawPath = uwsReq.getUrl();
          const query = uwsReq.getQuery();
          const params = {};
          for (let i = 0; i < names.length; i++) params[names[i]] = uwsReq.getParameter(i);
          h(uwsRes, query ? `${rawPath}?${query}` : rawPath, "", params);
        });
      } else if (!hasParams) {
        uwsApp[fn](route.path, (uwsRes, uwsReq) => {
          const rawPath = uwsReq.getUrl();
          const query = uwsReq.getQuery();
          const url = query ? `${rawPath}?${query}` : rawPath;
          const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
          let aborted = false;
          let totalBytes = 0;
          const chunks = [];
          uwsRes.onAborted(() => {
            aborted = true;
          });
          uwsRes.onData((chunk, isLast) => {
            if (aborted) return;
            if (chunk.byteLength > 0) {
              totalBytes += chunk.byteLength;
              if (totalBytes > maxBody) {
                aborted = true;
                uwsRes.cork(() => {
                  uwsRes.writeStatus("413 Payload Too Large");
                  uwsRes.writeHeader("Content-Type", CT_PROBLEM);
                  uwsRes.end(BODY_413);
                });
                return;
              }
              chunks.push(Buffer.from(chunk));
            }
            if (isLast) {
              const bodyStr = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
              h(uwsRes, url, bodyStr, emptyParams);
            }
          });
        });
      } else {
        uwsApp[fn](route.path, (uwsRes, uwsReq) => {
          const rawPath = uwsReq.getUrl();
          const query = uwsReq.getQuery();
          const url = query ? `${rawPath}?${query}` : rawPath;
          const params = {};
          for (let i = 0; i < names.length; i++) params[names[i]] = uwsReq.getParameter(i);
          const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
          let aborted = false;
          let totalBytes = 0;
          const chunks = [];
          uwsRes.onAborted(() => {
            aborted = true;
          });
          uwsRes.onData((chunk, isLast) => {
            if (aborted) return;
            if (chunk.byteLength > 0) {
              totalBytes += chunk.byteLength;
              if (totalBytes > maxBody) {
                aborted = true;
                uwsRes.cork(() => {
                  uwsRes.writeStatus("413 Payload Too Large");
                  uwsRes.writeHeader("Content-Type", CT_PROBLEM);
                  uwsRes.end(BODY_413);
                });
                return;
              }
              chunks.push(Buffer.from(chunk));
            }
            if (isLast) {
              const bodyStr = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
              h(uwsRes, url, bodyStr, params);
            }
          });
        });
      }
    }
    if (opts.wsRoutes) {
      for (const wsRoute of opts.wsRoutes) {
        uwsApp.ws(wsRoute.path, buildWsBehavior(wsRoute.handler));
      }
    }
    uwsApp.any("/*", (uwsRes) => {
      uwsRes.cork(() => {
        uwsRes.writeStatus("404 Not Found");
        uwsRes.writeHeader("Content-Type", CT_PROBLEM);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end(BODY_404);
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
  constructor(urlStr, rawBody) {
    this.urlStr = urlStr;
    this.rawBody = rawBody;
  }
  header(_name) {
    return void 0;
  }
  get url() {
    return this.urlStr;
  }
  get method() {
    return "GET";
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

// src/compiler.ts
var VALID_RESULT = Object.freeze({ valid: true, errors: null });
function makeZValidator(schema) {
  return function(data) {
    const r = schema.safeParse(data);
    if (r.success) {
      if (data !== null && typeof data === "object" && !Array.isArray(data)) {
        const d = data;
        const rd = r.data;
        for (const k of Object.keys(d)) if (!(k in rd)) delete d[k];
        Object.assign(d, rd);
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
var CTX_PROTO = {
  json(data, status) {
    return this._c.json(data, status);
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
    return this._c.header(name, value);
  }
};
function buildCtx(c, extra) {
  const ctx = Object.create(CTX_PROTO);
  ctx._c = c;
  ctx.c = c;
  ctx.body = void 0;
  ctx.query = void 0;
  ctx.params = void 0;
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
    if (extra.services !== void 0) ctx.services = extra.services;
  }
  return ctx;
}
function honoResultToResponse(result, ser) {
  if (result instanceof Response) return result;
  return jsonResponse200(ser(result));
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
function buildUwsHandlerContext(uwsRes, url, rawBody, params, body, query, services, ser, corsHeaders) {
  let done = false;
  const ctx = {
    req: new UwsReqAdapter(url, rawBody),
    body,
    params,
    query,
    services,
    user: null,
    json(data, status) {
      done = true;
      const body2 = ser(data);
      if (status !== void 0 && status !== 200) uwsFastWriteJsonStatus(uwsRes, body2, status, corsHeaders);
      else uwsFastWriteJson(uwsRes, body2, corsHeaders);
    },
    text(data, status) {
      done = true;
      uwsRes.cork(() => {
        uwsRes.writeStatus(`${status ?? 200}`);
        uwsRes.writeHeader("Content-Type", "text/plain");
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end(data);
      });
    },
    redirect(target, status) {
      done = true;
      uwsRes.cork(() => {
        uwsRes.writeStatus(`${status ?? 302}`);
        uwsRes.writeHeader("Location", target);
        if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
        uwsRes.end("");
      });
    }
  };
  return { ctx, responded: () => done };
}
function compileScopedRouteHandler(handler, compiled, scope) {
  const { validateBody: vb, validateQuery: vq, validateParams: vp, serialize } = compiled;
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
        return await runHonoScoped(scope, req, async (services, signalError) => {
          try {
            const result = await handler(buildCtx(c, { body, query, params, services }));
            return honoResultToResponse(result, ser);
          } catch (err) {
            signalError(err);
            if (err instanceof KozoError) return err.toResponse(path2);
            return internalErrorResponse(err, path2);
          }
        });
      } catch (err) {
        if (err instanceof KozoError) return err.toResponse(path2);
        return internalErrorResponse(err, path2);
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
      return await runHonoScoped(scope, req, async (services, signalError) => {
        try {
          const extra = { query, params, services };
          const result = handler.length === 0 ? handler() : handler(buildCtx(c, extra));
          if (result != null && typeof result.then === "function") {
            const r = await result;
            return honoResultToResponse(r, ser);
          }
          return honoResultToResponse(result, ser);
        } catch (err) {
          signalError(err);
          if (err instanceof KozoError) return err.toResponse(path2);
          return internalErrorResponse(err, path2);
        }
      });
    } catch (err) {
      if (err instanceof KozoError) return err.toResponse(path2);
      return internalErrorResponse(err, path2);
    }
  };
}
function isZodSchema(schema) {
  return typeof schema === "object" && schema !== null && "safeParse" in schema;
}
function jsonResponse200(body) {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
}
var EMPTY_BODY = Object.freeze({});
var EMPTY_BODY_HANDLER = () => EMPTY_BODY;
function dateReplacer(_key, value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}
function toJsonBody(result) {
  if (typeof result === "string") return result;
  return JSON.stringify(result, dateReplacer);
}
var SchemaCompiler = class {
  static compile(schema) {
    const compiled = {};
    if (schema.body && isZodSchema(schema.body)) {
      compiled.validateBody = makeZValidator(schema.body);
    }
    if (schema.query && isZodSchema(schema.query)) {
      compiled.validateQuery = makeZValidator(schema.query);
    }
    if (schema.params && isZodSchema(schema.params)) {
      compiled.validateParams = makeZValidator(schema.params);
    }
    if (schema.response) {
      compiled.serialize = (data) => JSON.stringify(data, dateReplacer);
    }
    return compiled;
  }
};
function compileRouteHandler(handler, schema, services, compiled, scope) {
  if (scope?.factory) {
    return compileScopedRouteHandler(handler, compiled, scope);
  }
  const { validateBody: vb, validateQuery: vq, validateParams: vp, serialize } = compiled;
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
        const result = await handler(buildCtx(c, { body, query, params, services: svc }));
        if (result instanceof Response) return result;
        return jsonResponse200(ser(result));
      } catch (err) {
        if (err instanceof KozoError) return err.toResponse(path2);
        return internalErrorResponse(err, path2);
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
      const extra = query || params || svc ? { query, params, services: svc } : void 0;
      const result = noArgs ? handler() : handler(buildCtx(c, extra));
      if (result instanceof Response) return result;
      if (result != null && typeof result.then === "function") {
        return result.then(
          (r) => r instanceof Response ? r : jsonResponse200(ser(r)),
          (err) => err instanceof KozoError ? err.toResponse(c.req.path) : internalErrorResponse(err, c.req.path)
        );
      }
      return jsonResponse200(ser(result));
    } catch (err) {
      if (err instanceof KozoError) return err.toResponse(c.req.path);
      return internalErrorResponse(err, c.req.path);
    }
  };
}
var DEFAULT_MAX_BODY_BYTES2 = 1 * 1024 * 1024;
function compileUwsNativeHandler(handler, schema, services, compiled, scope) {
  const { validateBody: vb, validateQuery: vq, validateParams: vp, serialize } = compiled;
  const svc = services != null && Object.keys(services).length > 0 ? services : void 0;
  const ser = serialize ?? toJsonBody;
  const noArgs = handler.length === 0;
  const hasScope = scope?.factory != null;
  function runUwsHandler(uwsRes, url, rawBody, params, body, query, runServices, corsHeaders) {
    const { ctx, responded } = buildUwsHandlerContext(uwsRes, url, rawBody, params, body, query, runServices ?? {}, ser, corsHeaders);
    const result = noArgs ? handler() : handler(ctx);
    if (result != null && typeof result.then === "function") {
      result.then(
        (r) => {
          if (!responded()) uwsFastWriteJson(uwsRes, ser(r), corsHeaders);
        },
        (err) => uwsFastWriteError(err, uwsRes, corsHeaders)
      );
      return;
    }
    if (!responded()) uwsFastWriteJson(uwsRes, ser(result), corsHeaders);
  }
  return function uws_handler(uwsRes, url, rawBody, params, corsHeaders) {
    try {
      let body;
      if (vb) {
        if (rawBody && rawBody.length > DEFAULT_MAX_BODY_BYTES2) {
          uwsRes.cork(() => {
            uwsRes.writeStatus("413 Payload Too Large");
            uwsRes.writeHeader("Content-Type", "application/json");
            if (corsHeaders) for (const [k, v] of corsHeaders) uwsRes.writeHeader(k, v);
            uwsRes.end(JSON.stringify({ error: "Payload Too Large", message: `Request body exceeds maximum allowed size` }));
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
      if (hasScope && scope) {
        void (async () => {
          let err;
          const resolved = await resolveScopedServices(scope, new UwsReqAdapter(url, rawBody));
          try {
            runUwsHandler(uwsRes, url, rawBody, params, body, query, resolved.services, corsHeaders);
          } catch (e) {
            err = e;
            uwsFastWriteError(err, uwsRes, corsHeaders);
          } finally {
            await resolved.finish(err);
          }
        })();
        return;
      }
      runUwsHandler(uwsRes, url, rawBody, params, body, query, svc, corsHeaders);
    } catch (err) {
      uwsFastWriteError(err, uwsRes, corsHeaders);
    }
  };
}

// src/middleware/rate-limit.ts
var memoryMap = /* @__PURE__ */ new Map();
var cleanupTimer = null;
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
var memoryStore = {
  async increment(key, windowMs) {
    const now = Date.now();
    let record = memoryMap.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
    }
    record.count++;
    memoryMap.set(key, record);
    ensureCleanup();
    return record;
  },
  async reset(key) {
    memoryMap.delete(key);
  }
};
function rateLimit(options) {
  const {
    max = 100,
    window = 60,
    keyGenerator = (c) => c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "anonymous",
    message = "Too many requests",
    store = memoryStore
  } = options;
  const windowMs = window * 1e3;
  return async (c, next) => {
    const key = keyGenerator(c);
    const record = await store.increment(key, windowMs);
    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, max - record.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1e3)));
    if (record.count > max) {
      return c.json({ error: message }, 429);
    }
    await next();
  };
}
function clearRateLimitStore() {
  memoryMap.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
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
      const fileUrl = pathToFileURL(fullPath).href;
      const module = await import(fileUrl);
      if (typeof module.default !== "function") {
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
      if (verbose) console.warn(`\u26A0\uFE0F  Skipping ${val.file}: no default export function`);
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
    const fileUrl = pathToFileURL(fullPath).href;
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
      console.error(`\u274C Failed to load middleware ${file}:`, err.message);
    }
  }
  definitions.sort((a, b) => {
    const depthA = a.pathPrefix.split("/").length;
    const depthB = b.pathPrefix.split("/").length;
    return depthA - depthB;
  });
  return definitions;
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
function evictIfNeeded() {
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
async function serveStaticFile(staticDir, urlPath, res) {
  const decoded = decodeURIComponent(urlPath);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
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
      evictIfNeeded();
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
      console.log(`\u{1F680} Kozo SSR production server \u2192 http://localhost:${port}`);
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
      console.log(`\u26A1 Kozo SSR dev server \u2192 http://localhost:${port}`);
      resolve2({ server, port });
    });
  });
}

// src/app.ts
var KozoGroup = class {
  constructor(prefix, parent) {
    this.prefix = prefix;
    this.parent = parent;
  }
  get(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") this.parent.get(this.prefix + path2, schemaOrHandler);
    else this.parent.get(this.prefix + path2, schemaOrHandler, handler, meta);
    return this;
  }
  post(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") this.parent.post(this.prefix + path2, schemaOrHandler);
    else this.parent.post(this.prefix + path2, schemaOrHandler, handler, meta);
    return this;
  }
  put(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") this.parent.put(this.prefix + path2, schemaOrHandler);
    else this.parent.put(this.prefix + path2, schemaOrHandler, handler, meta);
    return this;
  }
  patch(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") this.parent.patch(this.prefix + path2, schemaOrHandler);
    else this.parent.patch(this.prefix + path2, schemaOrHandler, handler, meta);
    return this;
  }
  delete(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") this.parent.delete(this.prefix + path2, schemaOrHandler);
    else this.parent.delete(this.prefix + path2, schemaOrHandler, handler, meta);
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
    if (config.scopedServices) {
      this._scope = {
        base: this.services,
        factory: config.scopedServices,
        onEnd: config.onRequestEnd
      };
    }
    this.app.onError((err, c) => {
      if (err instanceof KozoError) {
        return err.toResponse(c.req.path);
      }
      console.error("[Kozo] Unhandled error:", err);
      return internalErrorResponse(err, c.req.path);
    });
  }
  // Plugin system
  use(plugin) {
    plugin.install(this);
    return this;
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
    }
    const routes = await scanRoutes({ routesDir: dir, verbose: false });
    const compiled = await Promise.all(
      routes.map(async (route) => {
        const { path: path2, method, module } = route;
        const schema = module.schema ?? {};
        const compiledSchema = SchemaCompiler.compile(schema);
        return { path: path2, method, module, schema, compiledSchema };
      })
    );
    for (const { path: path2, method, module, schema, compiledSchema } of compiled) {
      const userHandler = module.default;
      const normalizedSchema = _Kozo.normalizeSchema(schema);
      const optimizedHandler = compileRouteHandler(
        (ctx) => userHandler(ctx),
        normalizedSchema,
        this.services,
        compiledSchema,
        this._scope
      );
      this.routes.push({ method, path: path2, schema: normalizedSchema, meta: module.meta });
      this.app[method](path2, optimizedHandler);
      const paramNames = [];
      path2.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return name;
      });
      this._deferredUws.push({ method: method.toUpperCase(), path: path2, paramNames, handler: (ctx) => userHandler(ctx), schema, compiled: compiledSchema });
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
    if (typeof schemaOrHandler === "function") return this.register("get", path2, {}, schemaOrHandler);
    return this.register("get", path2, schemaOrHandler, handler, meta);
  }
  post(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") return this.register("post", path2, {}, schemaOrHandler);
    return this.register("post", path2, schemaOrHandler, handler, meta);
  }
  put(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") return this.register("put", path2, {}, schemaOrHandler);
    return this.register("put", path2, schemaOrHandler, handler, meta);
  }
  patch(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") return this.register("patch", path2, {}, schemaOrHandler);
    return this.register("patch", path2, schemaOrHandler, handler, meta);
  }
  delete(path2, schemaOrHandler, handler, meta) {
    if (typeof schemaOrHandler === "function") return this.register("delete", path2, {}, schemaOrHandler);
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
    fn(new KozoGroup(prefix, this));
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
    const compiled = SchemaCompiler.compile(normalizedSchema);
    const optimizedHandler = compileRouteHandler(
      handler,
      normalizedSchema,
      this.services,
      compiled,
      this._scope
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
    const opts = typeof portOrOptions === "number" ? { port: portOrOptions } : portOrOptions ?? {};
    const port = opts.port ?? 3e3;
    const uwsBindings = await tryLoadUws();
    if (!uwsBindings) {
      throw new Error(
        "[Kozo] uWebSockets.js is required but not installed.\nRun: pnpm add uWebSockets.js"
      );
    }
    const manager = this.shutdownManager;
    const uwsRoutes = this._deferredUws.map((r) => ({
      method: r.method,
      path: r.path,
      paramNames: r.paramNames,
      handler: compileUwsNativeHandler(r.handler, r.schema, this.services, r.compiled, this._scope)
    }));
    this._deferredUws.length = 0;
    const result = await createUwsServer({
      uws: uwsBindings,
      routes: uwsRoutes,
      port,
      cors: opts.cors,
      isShuttingDown: () => manager.isShuttingDown(),
      trackRequest: () => manager.trackRequest(),
      wsRoutes: this._wsRoutes.length > 0 ? this._wsRoutes : void 0
    });
    manager.setServer(result.server);
    if (this._wsRoutes.length > 0) {
      console.log(`\u{1F680} uWebSockets.js transport active (HTTP + ${this._wsRoutes.length} WebSocket route${this._wsRoutes.length > 1 ? "s" : ""})`);
    } else {
      console.log("\u{1F680} uWebSockets.js transport active (C++ HTTP parser + native radix router)");
    }
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }
    return result;
  }
  async listen(port) {
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
    const server = serve({
      fetch: (req, ...args) => {
        const contentLength = req.headers.get("content-length");
        if (contentLength !== null && Number(contentLength) > this._maxBodyBytes) {
          return new Response(
            JSON.stringify({
              type: "about:blank",
              title: "Content Too Large",
              status: 413,
              detail: `Request body exceeds the ${this._maxBodyBytes}-byte limit`
            }),
            {
              status: 413,
              headers: { "Content-Type": "application/problem+json" }
            }
          );
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
    });
    manager.setServer(server);
    console.log(`\u{1F680} Kozo server listening on http://localhost:${finalPort}`);
    if (this._onStart) {
      await this._onStart({ services: this.services });
    }
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
    const manager = this.shutdownManager;
    const originalFetch = this.app.fetch;
    let shutdownStarted = false;
    manager.onShutdownStart(() => {
      shutdownStarted = true;
    });
    const shutdownFetch = (req, ...args) => {
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
    const result = await createSsrServer(ssrConfig, honoHandler, port);
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
  middleware(pathOrHandler, handler) {
    if (typeof pathOrHandler === "string") {
      this.app.use(pathOrHandler, handler);
    } else {
      this.app.use(pathOrHandler);
    }
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
  get fetch() {
    return this.app.fetch;
  }
};
function createKozo(config) {
  return new Kozo(config);
}

// src/index.ts
import { z as z3 } from "zod";

// src/openapi.ts
import { z } from "zod";
function zodToJsonSchema(zodSchema) {
  const { $schema, ...rest } = z.toJSONSchema(zodSchema);
  return rest;
}
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
import { z as z2 } from "zod";
import { randomUUID } from "crypto";
function defineEnv(shape) {
  const schema = z2.object(shape);
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`[Kozo] Invalid environment variables:
${errors}`);
  }
  return result.data;
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
var paginationSchema = z2.object({
  page: z2.coerce.number().int().min(1).default(1),
  limit: z2.coerce.number().int().min(1).max(100).default(10)
});
var uuidParams = z2.object({
  id: z2.string().uuid()
});
var idParams = z2.object({
  id: z2.coerce.number().int().positive()
});
var timestamps = z2.object({
  createdAt: z2.date(),
  updatedAt: z2.date()
});
var sortSchema = z2.object({
  sortBy: z2.string().optional(),
  sortOrder: z2.enum(["asc", "desc"]).default("asc")
});
var searchSchema = z2.object({
  q: z2.string().optional()
});
var successSchema = z2.object({
  success: z2.boolean(),
  message: z2.string().optional()
});
var deletedSchema = z2.object({
  success: z2.boolean(),
  deletedId: z2.string()
});
export {
  BadRequestError,
  ConflictError,
  ERROR_RESPONSES,
  ForbiddenError,
  GoneError,
  Kozo,
  KozoError,
  KozoGroup,
  NotFoundError,
  OpenAPIGenerator,
  SchemaCompiler,
  ShutdownManager,
  UnauthorizedError,
  ValidationFailedError,
  applyFileSystemRouting,
  buildNativeContext,
  clearRateLimitStore,
  compileRouteHandler,
  cors,
  createFileSystemRouting,
  createInflightTracker,
  createKozo,
  createOpenAPIGenerator,
  createShutdownManager,
  createSsrServer,
  defineEnv,
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
  idParams,
  internalErrorResponse,
  isMiddlewareFile,
  isRouteFile,
  logger,
  notFoundResponse,
  paginate,
  paginationSchema,
  rateLimit,
  scanMiddleware,
  scanRoutes,
  searchSchema,
  sortSchema,
  successSchema,
  timestamps,
  trackRequest,
  unauthorizedResponse,
  uuid,
  uuidParams,
  validationErrorResponse,
  verifyWebhookSignature,
  z3 as z
};
