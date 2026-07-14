// src/middleware/logger.ts
function sanitizeForLog(input) {
  return input.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\x1b/g, "\\x1b");
}
function logger(options = {}) {
  const { prefix = "\u{1F310}", colorize = true } = options;
  return async (c, next) => {
    const start = Date.now();
    const method = sanitizeForLog(c.req.method);
    const path = sanitizeForLog(c.req.path);
    await next();
    const duration = Date.now() - start;
    const status = c.res.status;
    const statusColor = status >= 500 ? "\u{1F534}" : status >= 400 ? "\u{1F7E1}" : "\u{1F7E2}";
    const log = `${prefix} ${method.padEnd(6)} ${path} ${statusColor} ${status} ${duration}ms`;
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
function rateLimitGuard(options) {
  const {
    max,
    window,
    keyGenerator = (req) => req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? req.header("x-real-ip") ?? req.remoteAddress ?? "anonymous",
    message = "Too many requests",
    store = memoryStore
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
      return { deny: { status: 429, body: { error: message }, headers } };
    }
    return { headers };
  };
}
function clearRateLimitStore() {
  memoryMap.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
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
var BODY_404_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.NOT_FOUND.type,
  title: ERROR_RESPONSES.NOT_FOUND.title,
  status: 404
});
var BODY_401_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.UNAUTHORIZED.type,
  title: ERROR_RESPONSES.UNAUTHORIZED.title,
  status: 401
});
var BODY_403_STATIC = JSON.stringify({
  type: ERROR_RESPONSES.FORBIDDEN.type,
  title: ERROR_RESPONSES.FORBIDDEN.title,
  status: 403
});
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
import { pathToFileURL } from "url";
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
    const url = handlerPath.startsWith("file://") ? handlerPath : pathToFileURL(handlerPath).href;
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
export {
  applyFileSystemRouting,
  clearRateLimitStore,
  cors,
  createFileSystemRouting,
  errorHandler,
  logger,
  rateLimit,
  rateLimitGuard,
  verifyWebhookSignature
};
