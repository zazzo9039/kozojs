// src/index.ts
import { jwtVerify, decodeJwt } from "jose";
import { KozoError, UnauthorizedError } from "@kozojs/core";
function defaultGetToken(c) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return void 0;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return void 0;
  }
  return parts[1];
}
function authenticateJWT(secretOrPublicKey, opts = {}) {
  const {
    prefix = "/api",
    getToken = defaultGetToken,
    getKey,
    expectedClaims,
    allowedAlgorithms = ["HS256", "HS384", "HS512"],
    optional = false
  } = opts;
  const key = typeof secretOrPublicKey === "string" ? new TextEncoder().encode(secretOrPublicKey) : secretOrPublicKey;
  return async (c, next) => {
    if (prefix !== "") {
      const path = c.req.path;
      if (!path.startsWith(prefix)) {
        return next();
      }
    }
    const token = getToken(c);
    if (!token) {
      if (optional) return next();
      return c.json({
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        detail: "Missing authentication token"
      }, 401);
    }
    try {
      const verifyOpts = { algorithms: allowedAlgorithms };
      const { payload } = getKey ? await jwtVerify(token, getKey, verifyOpts) : await jwtVerify(token, key, verifyOpts);
      if (expectedClaims) {
        for (const [claim, value] of Object.entries(expectedClaims)) {
          if (payload[claim] !== value) {
            return c.json({
              type: "about:blank",
              title: "Unauthorized",
              status: 401,
              detail: `Invalid claim: ${claim}`
            }, 401);
          }
        }
      }
      c.set("user", payload);
      c.set("user", payload);
      await next();
    } catch (error) {
      let detail = "Invalid or expired token";
      if (error.code) {
        switch (error.code) {
          case "ERR_JWT_EXPIRED":
            detail = "Token has expired";
            break;
          case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
            detail = "Invalid token signature";
            break;
          case "ERR_JWT_CLAIM_VALIDATION_FAILED":
            detail = error.message || "Token claim validation failed";
            break;
        }
      }
      return c.json({
        type: "about:blank",
        title: "Unauthorized",
        status: 401,
        detail
      }, 401);
    }
  };
}
async function createJWT(payload, secret, options = {}) {
  const { SignJWT } = await import("jose");
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload).setProtectedHeader({ alg: options.algorithm || "HS256" }).setIssuedAt().setExpirationTime(options.expiresIn || "1h").sign(key);
}
function decodeJWT(token) {
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}
function getUser(c) {
  try {
    return c.get("user") ?? null;
  } catch {
    return null;
  }
}
function canActivate(...guards) {
  return async (c, next) => {
    for (const guard of guards) {
      const result = await guard(c);
      if (result === true) continue;
      if (result === false) {
        return c.json({
          type: "https://kozo-docs.vercel.app/docs/core/errors#forbidden",
          title: "Forbidden",
          status: 403,
          detail: "You do not have permission to access this resource"
        }, 403);
      }
      return result;
    }
    return next();
  };
}
var isAuthenticated = (c) => {
  const user = getUser(c);
  if (!user) {
    return c.json({
      type: "https://kozo-docs.vercel.app/docs/core/errors#unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "Authentication required"
    }, 401);
  }
  return true;
};
function hasRole(role) {
  const allowed = Array.isArray(role) ? role : [role];
  return (c) => {
    const user = getUser(c);
    if (!user) return false;
    const userRole = typeof user.role === "string" ? user.role : null;
    const userRoles = Array.isArray(user.roles) ? user.roles : [];
    const hasMatch = allowed.some((r) => r === userRole || userRoles.includes(r));
    return hasMatch;
  };
}
var isSelf = (c) => {
  const user = getUser(c);
  if (!user) return false;
  const paramId = c.req.param("id");
  return user.sub === paramId || user.id === paramId;
};
function anyOf(...guards) {
  return async (c) => {
    for (const guard of guards) {
      const result = await guard(c);
      if (result === true) return true;
    }
    return false;
  };
}
function isPublicPath(pathname, publicPaths) {
  for (const p of publicPaths) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}
async function collectPublicPaths(routesDir, extraPublicPaths) {
  const { scanRoutes, resolveRouteModule } = await import("@kozojs/core");
  const scanned = await scanRoutes({ routesDir, verbose: false });
  return /* @__PURE__ */ new Set([
    ...extraPublicPaths,
    ...scanned.filter((r) => resolveRouteModule(r.module)?.meta?.auth === false).map((r) => r.path)
  ]);
}
async function registerAuthBeforeLoadRoutes(app, secretOrPublicKey, options) {
  const { routesDir, extraPublicPaths = [], prefix = "/api", ...authOpts } = options;
  const publicPaths = await collectPublicPaths(routesDir, extraPublicPaths);
  const jwtFn = authenticateJWT(secretOrPublicKey, { ...authOpts, prefix: "" });
  app.middleware(`${prefix}/*`, authenticateJWT(secretOrPublicKey, { optional: true, prefix: "", ...authOpts }));
  app.middleware(`${prefix}/*`, async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (isPublicPath(pathname, publicPaths)) return next();
    return jwtFn(c, next);
  });
}
function decodeTokenPayload(token) {
  try {
    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;
    const json = atob(base64Payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
export {
  KozoError,
  UnauthorizedError,
  anyOf,
  authenticateJWT,
  canActivate,
  createJWT,
  decodeJWT,
  decodeTokenPayload,
  getUser,
  hasRole,
  isAuthenticated,
  isSelf,
  registerAuthBeforeLoadRoutes
};
