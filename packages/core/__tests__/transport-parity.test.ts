// ============================================================================
// Transport parity — listen() (Hono) vs nativeListen() (uWebSockets.js)
// ============================================================================
//
// Same routes, same HTTP requests, compare status / Content-Type / body.
// Skipped when uWebSockets.js is not installed.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import http from 'node:http';
import { createKozo } from '../src/app.js';
import { tryLoadUws } from '../src/uws-transport.js';
import { DEFAULT_MAX_BODY_BYTES } from '../src/compiler.js';
import { KozoError, NotFoundError } from '../src/errors.js';

// ── Types & HTTP helpers ───────────────────────────────────────────────────

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

interface RequestOptions {
  method?: string;
  path: string;
  body?: string | Buffer;
  headers?: Record<string, string>;
}

function headerValue(
  headers: HttpResult['headers'],
  name: string,
): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(v) ? v[0] : v;
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

async function httpRequest(port: number, opts: RequestOptions): Promise<HttpResult> {
  const method = opts.method ?? 'GET';
  const headers = { ...opts.headers };

  if (opts.body !== undefined && headers['Content-Length'] === undefined) {
    const len = typeof opts.body === 'string' ? Buffer.byteLength(opts.body) : opts.body.length;
    headers['Content-Length'] = String(len);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, method, path: opts.path, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode!,
            headers: res.headers as HttpResult['headers'],
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.end(opts.body);
    else req.end();
  });
}

// ── Parity assertions ────────────────────────────────────────────────────────

function normalizeJsonBody(body: string): string {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    delete j.instance;
    if (Array.isArray(j.errors)) {
      j.errors = (j.errors as Array<Record<string, unknown>>).map(({ field, message, code }) => ({
        field,
        message,
        code,
      }));
    }
    // Hono may include detail on 500 in non-production; uWS uses static body
    if (j.title === 'Internal Server Error') delete j.detail;
    return JSON.stringify(j);
  } catch {
    return body;
  }
}

function assertParity(
  hono: HttpResult,
  native: HttpResult,
  opts?: { exactBody?: boolean },
): void {
  expect(native.status).toBe(hono.status);

  const honoCt = headerValue(hono.headers, 'content-type')?.split(';')[0]?.trim();
  const nativeCt = headerValue(native.headers, 'content-type')?.split(';')[0]?.trim();
  expect(nativeCt).toBe(honoCt);

  if (opts?.exactBody) {
    expect(native.body).toBe(hono.body);
  } else {
    expect(normalizeJsonBody(native.body)).toBe(normalizeJsonBody(hono.body));
  }
}

// ── Shared app factory ───────────────────────────────────────────────────────

function createParityApp() {
  const app = createKozo({
    services: { appName: 'parity-test' },
    scopedServices: (_base, req) => ({
      reqId: req.header('x-request-id') ?? 'anonymous',
    }),
  });

  app.get('/health', () => ({ status: 'ok' }));

  app.get('/users/:id', { params: z.object({ id: z.string().uuid() }) }, (ctx) => ({
    id: ctx.params.id,
  }));

  app.post('/echo', { body: z.object({ msg: z.string() }) }, (ctx) => ({
    echo: ctx.body.msg,
  }));

  app.get('/contract', {
    response: { 200: z.object({ id: z.string() }) },
  }, () => ({ id: '1', surpriseFromDb: 'extra' }));

  app.get('/any-response', {
    response: { 200: z.any() },
  }, () => ({ ok: true, n: 42 }));

  app.get('/date-response', {
    response: { 200: z.object({ created: z.date() }) },
  }, () => ({ created: new Date('2025-06-01T12:00:00.000Z') }));

  app.get('/gone', () => {
    throw new KozoError('Gone', 410, 'gone');
  });

  app.get('/missing', () => {
    throw new NotFoundError('Resource not found');
  });

  app.get('/crash', () => {
    throw new Error('boom');
  });

  app.get('/scoped', (ctx) => ({
    reqId: (ctx.services as { reqId: string }).reqId,
    appName: ctx.services.appName,
  }));

  // ctx.header() must apply on BOTH transports even when the handler returns a
  // value (not ctx.json()). On uWS it previously 500'd (no header method); on
  // Hono the header was silently dropped by the raw new Response().
  app.get('/with-header', (ctx) => {
    ctx.header('X-Custom', 'kozo');
    return { ok: true };
  });

  // Optional path param (`:id?`) must behave the same on both transports:
  // `/opt/42` → id present, `/opt` → id absent (not a 404). uWS has no
  // optional-param syntax, so nativeListen expands this into two registrations.
  app.get('/opt/:id?', { params: z.object({ id: z.string().optional() }) }, (ctx) => ({
    id: ctx.params.id ?? null,
  }));

  return app;
}

async function runParity(reqOpts: RequestOptions): Promise<{ hono: HttpResult; native: HttpResult }> {
  const honoPort = await freePort();
  const honoApp = createParityApp();
  const nativeApp = createParityApp();

  vi.spyOn(console, 'log').mockImplementation(() => {});

  await honoApp.listen(honoPort);
  // port 0 → core picks the ephemeral port (with bind-race retry)
  const native = await nativeApp.nativeListen({ port: 0 });

  try {
    const [hono, nativeRes] = await Promise.all([
      httpRequest(honoPort, reqOpts),
      httpRequest(native.port, reqOpts),
    ]);
    return { hono, native: nativeRes };
  } finally {
    native.server.close();
    await honoApp.shutdown({ timeoutMs: 3000 }).catch(() => {});
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

const uwsAvailable = (await tryLoadUws()) !== null;

describe.skipIf(!uwsAvailable)('transport parity: listen() vs nativeListen()', () => {
  it('1 — GET simple JSON', async () => {
    const { hono, native } = await runParity({ path: '/health' });
    assertParity(hono, native, { exactBody: true });
    expect(JSON.parse(hono.body)).toEqual({ status: 'ok' });
  });

  it('2 — GET invalid path params → 400', async () => {
    const { hono, native } = await runParity({ path: '/users/not-a-uuid' });
    assertParity(hono, native);
    expect(hono.status).toBe(400);
  });

  it('3 — POST valid body', async () => {
    const { hono, native } = await runParity({
      method: 'POST',
      path: '/echo',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg: 'hello' }),
    });
    assertParity(hono, native, { exactBody: true });
    expect(JSON.parse(hono.body)).toEqual({ echo: 'hello' });
  });

  it('4 — POST invalid body → 400', async () => {
    const { hono, native } = await runParity({
      method: 'POST',
      path: '/echo',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wrong: 123 }),
    });
    assertParity(hono, native);
    expect(hono.status).toBe(400);
  });

  it('5 — fjs contract enforcement (extra fields omitted)', async () => {
    const { hono, native } = await runParity({ path: '/contract' });
    assertParity(hono, native, { exactBody: true });
    expect(hono.body).toBe('{"id":"1"}');
  });

  it('6 — json-stringify fallback (z.any response)', async () => {
    const { hono, native } = await runParity({ path: '/any-response' });
    assertParity(hono, native, { exactBody: true });
  });

  it('6b — json-stringify fallback (z.date in response schema)', async () => {
    const { hono, native } = await runParity({ path: '/date-response' });
    assertParity(hono, native, { exactBody: true });
  });

  it('7a — KozoError 410', async () => {
    const { hono, native } = await runParity({ path: '/gone' });
    assertParity(hono, native);
    expect(hono.status).toBe(410);
  });

  it('7b — NotFoundError 404', async () => {
    const { hono, native } = await runParity({ path: '/missing' });
    assertParity(hono, native);
    expect(hono.status).toBe(404);
  });

  it('8 — generic handler error → 500', async () => {
    const { hono, native } = await runParity({ path: '/crash' });
    assertParity(hono, native);
    expect(hono.status).toBe(500);
  });

  it('9 — unknown route → 404', async () => {
    const { hono, native } = await runParity({ path: '/does-not-exist' });
    assertParity(hono, native);
    expect(hono.status).toBe(404);
  });

  it('12b — ctx.header() applied on both transports (return-value handler)', async () => {
    const { hono, native } = await runParity({ path: '/with-header' });
    assertParity(hono, native, { exactBody: true });
    expect(hono.status).toBe(200);
    expect(headerValue(hono.headers, 'x-custom')).toBe('kozo');
    expect(headerValue(native.headers, 'x-custom')).toBe('kozo');
  });

  it('13a — optional param present (/opt/42)', async () => {
    const { hono, native } = await runParity({ path: '/opt/42' });
    assertParity(hono, native, { exactBody: true });
    expect(hono.status).toBe(200);
    expect(JSON.parse(hono.body)).toEqual({ id: '42' });
    expect(JSON.parse(native.body)).toEqual({ id: '42' });
  });

  it('13b — optional param absent (/opt) → 200, not 404', async () => {
    const { hono, native } = await runParity({ path: '/opt' });
    assertParity(hono, native, { exactBody: true });
    expect(hono.status).toBe(200);
    expect(JSON.parse(hono.body)).toEqual({ id: null });
    expect(JSON.parse(native.body)).toEqual({ id: null });
  });

  it('10a — POST empty body → 400', async () => {
    const { hono, native } = await runParity({
      method: 'POST',
      path: '/echo',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    assertParity(hono, native);
    expect(hono.status).toBe(400);
  });

  it('10b — POST malformed JSON → 400', async () => {
    const { hono, native } = await runParity({
      method: 'POST',
      path: '/echo',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    assertParity(hono, native);
    expect(hono.status).toBe(400);
  });

  it('11 — body exceeds maxBodyBytes → 413', async () => {
    const bigBody = Buffer.alloc(DEFAULT_MAX_BODY_BYTES + 1);
    const reqOpts: RequestOptions = {
      method: 'POST',
      path: '/echo',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bigBody.length),
      },
      body: bigBody,
    };

    const honoPort = await freePort();
    const nativePort = await freePort();
    const honoApp = createParityApp();
    const nativeApp = createParityApp();

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await honoApp.listen(honoPort);
    const native = await nativeApp.nativeListen({ port: nativePort });

    try {
      const hono = await httpRequest(honoPort, reqOpts).catch((err: NodeJS.ErrnoException) =>
        err.code === 'ECONNRESET' ? { status: 413, headers: {}, body: '' } : Promise.reject(err),
      );
      const nativeRes = await httpRequest(nativePort, reqOpts).catch((err: NodeJS.ErrnoException) =>
        err.code === 'ECONNRESET' ? { status: 413, headers: {}, body: '' } : Promise.reject(err),
      );

      expect(hono.status).toBe(413);
      expect(nativeRes.status).toBe(413);
      if (hono.body && nativeRes.body) assertParity(hono, nativeRes);
    } finally {
      native.server.close();
      await honoApp.shutdown({ timeoutMs: 3000 }).catch(() => {});
    }
  });

  it('12 — scoped services in ctx.services', async () => {
    const { hono, native } = await runParity({
      path: '/scoped',
      headers: { 'x-request-id': 'trace-abc' },
    });
    assertParity(hono, native, { exactBody: true });
    expect(JSON.parse(hono.body)).toEqual({ reqId: 'trace-abc', appName: 'parity-test' });
  });
});
