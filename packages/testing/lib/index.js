// src/index.ts
import { createKozo } from "@kozojs/core";
function appendQuery(searchParams, query) {
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) searchParams.append(key, String(item));
  }
}
function isPassThroughBody(body) {
  return body instanceof URLSearchParams || body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body);
}
function buildRequest(options) {
  const { method = "GET", url, headers = {}, body, query } = options;
  const requestUrl = new URL(url, "http://localhost");
  if (query && Object.keys(query).length > 0) {
    appendQuery(requestUrl.searchParams, query);
  }
  const finalHeaders = new Headers(headers);
  let finalBody;
  if (body !== void 0) {
    if (typeof body === "string") {
      finalBody = new TextEncoder().encode(body);
    } else if (isPassThroughBody(body)) {
      finalBody = body;
    } else {
      if (!finalHeaders.has("content-type")) {
        finalHeaders.set("content-type", "application/json");
      }
      finalBody = JSON.stringify(body);
    }
  }
  return new Request(requestUrl, { method, headers: finalHeaders, body: finalBody });
}
async function readTestResponse(res) {
  const bodyText = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: bodyText,
    ok: res.ok,
    json() {
      try {
        return JSON.parse(bodyText);
      } catch {
        throw new Error("Failed to parse response body as JSON");
      }
    }
  };
}
async function doInject(transport, options) {
  return readTestResponse(await transport.send(buildRequest(options)));
}
function normalizeTreeSegment(segment) {
  if (segment === "*") return "$wildcard";
  const dynamic = segment.startsWith(":");
  const source = dynamic ? segment.slice(1).replace(/\?$/, "") : segment;
  if (!/^[A-Za-z0-9._-]+$/.test(source)) {
    throw new Error(
      `[Kozo] Cannot create contract client: route segment "${segment}" contains unsupported characters.`
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
function materializePath(routePath, params) {
  const segments = routePath.split("/").filter(Boolean);
  const materialized = [];
  for (const segment of segments) {
    if (segment.startsWith(":")) {
      const optional = segment.endsWith("?");
      const name = segment.slice(1, optional ? -1 : void 0);
      const value = params?.[name];
      if (value == null) {
        if (optional) continue;
        throw new TypeError(
          `[Kozo] Missing path parameter "${name}" for route ${routePath}.`
        );
      }
      materialized.push(encodeURIComponent(String(value)));
      continue;
    }
    if (segment === "*") {
      const value = params?.wildcard;
      if (value == null) {
        throw new TypeError(
          `[Kozo] Missing path parameter "wildcard" for route ${routePath}.`
        );
      }
      materialized.push(
        ...String(value).split("/").map((part) => encodeURIComponent(part))
      );
      continue;
    }
    materialized.push(segment);
  }
  return materialized.length > 0 ? `/${materialized.join("/")}` : "/";
}
function stringHeaders(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  const headers = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue == null) continue;
    headers[key] = Array.isArray(headerValue) ? headerValue.map(String).join(", ") : String(headerValue);
  }
  return headers;
}
function createRouteOperation(transport, method, routePath) {
  return async (input = {}) => {
    const params = input.params && typeof input.params === "object" ? input.params : void 0;
    const query = input.query && typeof input.query === "object" ? input.query : void 0;
    return doInject(transport, {
      method: method.toUpperCase(),
      url: materializePath(routePath, params),
      query,
      headers: stringHeaders(input.headers),
      body: input.body
    });
  };
}
function createRouteTree(app, transport, reservedRootKeys = /* @__PURE__ */ new Set()) {
  const root = /* @__PURE__ */ Object.create(null);
  const segmentSources = /* @__PURE__ */ new WeakMap();
  for (const route of app.getRoutes()) {
    const pathSegments = route.path.split("/").filter(Boolean);
    let node = root;
    for (let index = 0; index < pathSegments.length; index++) {
      const source = pathSegments[index];
      const key = normalizeTreeSegment(source);
      if (index === 0 && reservedRootKeys.has(key)) {
        throw new Error(
          `[Kozo] Cannot create contract client: route ${route.method.toUpperCase()} ${route.path} conflicts with reserved root member "${key}".`
        );
      }
      let sources = segmentSources.get(node);
      if (!sources) {
        sources = /* @__PURE__ */ new Map();
        segmentSources.set(node, sources);
      }
      const previousSource = sources.get(key);
      if (previousSource !== void 0 && previousSource !== source) {
        throw new Error(
          `[Kozo] Cannot create contract client: route segments "${previousSource}" and "${source}" both normalize to "${key}".`
        );
      }
      sources.set(key, source);
      const child = node[key];
      if (typeof child === "function") {
        throw new Error(
          `[Kozo] Cannot create contract client: path segment "${source}" conflicts with an HTTP method at ${route.path}.`
        );
      }
      if (child === void 0) {
        node[key] = /* @__PURE__ */ Object.create(null);
      }
      node = node[key];
    }
    const method = route.method.toLowerCase();
    if (node[method] !== void 0) {
      throw new Error(
        `[Kozo] Cannot create contract client: duplicate operation ${route.method.toUpperCase()} ${route.path}.`
      );
    }
    node[method] = createRouteOperation(transport, route.method, route.path);
  }
  return root;
}
function createFetchTestTransport(app) {
  const fetchFn = app.fetch.bind(app);
  return {
    async send(request) {
      return Promise.resolve(fetchFn(request));
    }
  };
}
function createTestClient(app) {
  const transport = createFetchTestTransport(app);
  return {
    app,
    inject: (opts) => doInject(transport, opts),
    get: (url, opts = {}) => doInject(transport, { ...opts, method: "GET", url }),
    post: (url, body, opts = {}) => doInject(transport, { ...opts, method: "POST", url, body }),
    put: (url, body, opts = {}) => doInject(transport, { ...opts, method: "PUT", url, body }),
    patch: (url, body, opts = {}) => doInject(transport, { ...opts, method: "PATCH", url, body }),
    delete: (url, opts = {}) => doInject(transport, { ...opts, method: "DELETE", url })
  };
}
function createContractTestClient(app) {
  return createRouteTree(
    app,
    createFetchTestTransport(app)
  );
}
function createTestApp(config) {
  return createTestClient(createKozo(config));
}
async function createNativeTestTransport(app) {
  const { port, server } = await app.nativeListen({ port: 0 });
  const base = `http://127.0.0.1:${port}`;
  let closed = false;
  return {
    port,
    async close() {
      if (closed) return;
      closed = true;
      server.close();
    },
    async send(request) {
      const url = new URL(request.url);
      const method = request.method;
      const canHaveBody = method !== "GET" && method !== "HEAD";
      const bytes = canHaveBody ? await request.arrayBuffer() : void 0;
      const body = bytes && bytes.byteLength > 0 ? bytes : void 0;
      return fetch(base + url.pathname + url.search, {
        method,
        headers: request.headers,
        body
      });
    }
  };
}
async function createNativeTestClient(app) {
  const transport = await createNativeTestTransport(app);
  return {
    app,
    port: transport.port,
    close: () => transport.close(),
    inject: (opts) => doInject(transport, opts),
    get: (url, opts = {}) => doInject(transport, { ...opts, method: "GET", url }),
    post: (url, body, opts = {}) => doInject(transport, { ...opts, method: "POST", url, body }),
    put: (url, body, opts = {}) => doInject(transport, { ...opts, method: "PUT", url, body }),
    patch: (url, body, opts = {}) => doInject(transport, { ...opts, method: "PATCH", url, body }),
    delete: (url, opts = {}) => doInject(transport, { ...opts, method: "DELETE", url })
  };
}
async function createNativeContractTestClient(app) {
  const transport = await createNativeTestTransport(app);
  const client = createRouteTree(
    app,
    transport,
    /* @__PURE__ */ new Set(["close", "port"])
  );
  Object.defineProperties(client, {
    port: { value: transport.port, enumerable: false },
    close: { value: () => transport.close(), enumerable: false }
  });
  return client;
}
export {
  createContractTestClient,
  createFetchTestTransport,
  createNativeContractTestClient,
  createNativeTestClient,
  createNativeTestTransport,
  createTestApp,
  createTestClient
};
