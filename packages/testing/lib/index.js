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
async function doInject(fetchFn, options) {
  const req = buildRequest(options);
  const res = await Promise.resolve(fetchFn(req));
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
function createTestClient(app) {
  const fetchFn = app.fetch.bind(app);
  return {
    app,
    inject: (opts) => doInject(fetchFn, opts),
    get: (url, opts = {}) => doInject(fetchFn, { ...opts, method: "GET", url }),
    post: (url, body, opts = {}) => doInject(fetchFn, { ...opts, method: "POST", url, body }),
    put: (url, body, opts = {}) => doInject(fetchFn, { ...opts, method: "PUT", url, body }),
    patch: (url, body, opts = {}) => doInject(fetchFn, { ...opts, method: "PATCH", url, body }),
    delete: (url, opts = {}) => doInject(fetchFn, { ...opts, method: "DELETE", url })
  };
}
function createTestApp(config) {
  return createTestClient(createKozo(config));
}
async function createNativeTestClient(app) {
  const { port, server } = await app.nativeListen({ port: 0 });
  const base = `http://127.0.0.1:${port}`;
  const fetchFn = async (req) => {
    const u = new URL(req.url);
    const method = req.method;
    const body = method === "GET" || method === "HEAD" ? void 0 : await req.text();
    return fetch(base + u.pathname + u.search, { method, headers: req.headers, body });
  };
  let closed = false;
  return {
    app,
    port,
    async close() {
      if (closed) return;
      closed = true;
      server.close();
    },
    inject: (opts) => doInject(fetchFn, opts),
    get: (url, opts = {}) => doInject(fetchFn, { ...opts, method: "GET", url }),
    post: (url, body, opts = {}) => doInject(fetchFn, { ...opts, method: "POST", url, body }),
    put: (url, body, opts = {}) => doInject(fetchFn, { ...opts, method: "PUT", url, body }),
    patch: (url, body, opts = {}) => doInject(fetchFn, { ...opts, method: "PATCH", url, body }),
    delete: (url, opts = {}) => doInject(fetchFn, { ...opts, method: "DELETE", url })
  };
}
export {
  createNativeTestClient,
  createTestApp,
  createTestClient
};
