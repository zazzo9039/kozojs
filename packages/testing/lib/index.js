// src/index.ts
import { createKozo } from "@kozojs/core";
function buildRequest(options) {
  const { method = "GET", url, headers = {}, body, query } = options;
  let fullUrl = url.startsWith("http") ? url : `http://localhost${url}`;
  if (query && Object.keys(query).length > 0) {
    const qs = new URLSearchParams(query);
    fullUrl += (fullUrl.includes("?") ? "&" : "?") + qs.toString();
  }
  const finalHeaders = { ...headers };
  let finalBody;
  if (body !== void 0) {
    if (!finalHeaders["content-type"] && !finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
    finalBody = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(fullUrl, { method, headers: finalHeaders, body: finalBody });
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
