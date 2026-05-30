// ============================================================================
// Tests for fast-response.ts & native-context.ts
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  fastWriteJson,
  fastWriteText,
  fastWriteHtml,
  fastWriteJsonStatus,
  fastWrite404,
  fastWrite500,
  fastWrite400,
  fastWriteError,
  fastCL,
} from '../src/fast-response.js';
import { buildNativeContext } from '../src/native-context.js';
import { KozoError } from '../src/errors.js';

// ── Helper: make a real HTTP request and get response ────────────────────
function makeRequest(
  port: number,
  method = 'GET',
  path = '/',
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, method, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode!,
          headers: res.headers as Record<string, string>,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Helper: start a temporary server with a handler ──────────────────────
async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  fn: (port: number) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

// ════════════════════════════════════════════════════════════════════════
// fastCL tests
// ════════════════════════════════════════════════════════════════════════

describe('fastCL (Content-Length cache)', () => {
  it('returns cached strings for 0–9999', () => {
    expect(fastCL(0)).toBe('0');
    expect(fastCL(42)).toBe('42');
    expect(fastCL(9999)).toBe('9999');
  });

  it('returns fresh string for values ≥ 10000', () => {
    expect(fastCL(10_000)).toBe('10000');
    expect(fastCL(123_456)).toBe('123456');
  });
});

// ════════════════════════════════════════════════════════════════════════
// fastWriteJson tests
// ════════════════════════════════════════════════════════════════════════

describe('fastWriteJson', () => {
  it('sends 200 with correct Content-Type and body', async () => {
    await withServer((_req, res) => {
      fastWriteJson(res, '{"ok":true}');
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('application/json');
      expect(r.body).toBe('{"ok":true}');
    });
  });

  it('Content-Length matches ASCII body length', async () => {
    const body = JSON.stringify({ hello: 'world', n: 42 });
    await withServer((_req, res) => {
      fastWriteJson(res, body);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.headers['content-length']).toBe(String(body.length));
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// fastWriteText tests
// ════════════════════════════════════════════════════════════════════════

describe('fastWriteText', () => {
  it('sends plain text response', async () => {
    await withServer((_req, res) => {
      fastWriteText(res, 'hello');
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('text/plain');
      expect(r.body).toBe('hello');
    });
  });

  it('respects custom status code', async () => {
    await withServer((_req, res) => {
      fastWriteText(res, 'created', 201);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(201);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// fastWriteHtml tests
// ════════════════════════════════════════════════════════════════════════

describe('fastWriteHtml', () => {
  it('sends HTML response for SSR', async () => {
    await withServer((_req, res) => {
      fastWriteHtml(res, '<h1>Hello</h1>');
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.body).toBe('<h1>Hello</h1>');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// fastWriteJsonStatus tests
// ════════════════════════════════════════════════════════════════════════

describe('fastWriteJsonStatus', () => {
  it('sends JSON with custom status', async () => {
    await withServer((_req, res) => {
      fastWriteJsonStatus(res, '{"id":"1"}', 201);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(201);
      expect(JSON.parse(r.body)).toEqual({ id: '1' });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// Error response tests
// ════════════════════════════════════════════════════════════════════════

describe('fastWrite404', () => {
  it('sends RFC 7807 404 response', async () => {
    await withServer((_req, res) => {
      fastWrite404(res);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(404);
      expect(r.headers['content-type']).toBe('application/problem+json');
      const body = JSON.parse(r.body);
      expect(body.status).toBe(404);
      expect(body.title).toBe('Resource Not Found');
    });
  });
});

describe('fastWrite500', () => {
  it('sends RFC 7807 500 response', async () => {
    await withServer((_req, res) => {
      fastWrite500(res);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(500);
      const body = JSON.parse(r.body);
      expect(body.status).toBe(500);
    });
  });
});

describe('fastWrite400', () => {
  it('sends validation error with field details', async () => {
    await withServer((_req, res) => {
      fastWrite400('body', [
        { instancePath: '/name', message: 'must be string', keyword: 'type' },
      ], res);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(400);
      const body = JSON.parse(r.body);
      expect(body.status).toBe(400);
      expect(body.errors[0].field).toBe('name');
      expect(body.errors[0].code).toBe('type');
    });
  });
});

describe('fastWriteError', () => {
  it('handles KozoError with correct status', async () => {
    await withServer((_req, res) => {
      const err = new KozoError('Not Found', 404, 'not-found');
      fastWriteError(err, res);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(404);
      const body = JSON.parse(r.body);
      expect(body.type).toContain('not-found');
    });
  });

  it('falls back to 500 for unknown errors', async () => {
    await withServer((_req, res) => {
      fastWriteError(new Error('oops'), res);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(500);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// NativeContext tests
// ════════════════════════════════════════════════════════════════════════

describe('buildNativeContext', () => {
  it('ctx.json() sends JSON response', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.json({ status: 'ok' });
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(200);
      expect(JSON.parse(r.body)).toEqual({ status: 'ok' });
    });
  });

  it('ctx.json() with custom status', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.json({ id: '1' }, 201);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(201);
    });
  });

  it('ctx.json() uses serializer when provided', async () => {
    const mockSerializer = (data: any) => `{"fast":true,"n":${data.n}}`;
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {}, mockSerializer);
      ctx.json({ n: 42 });
    }, async (port) => {
      const r = await makeRequest(port);
      expect(JSON.parse(r.body)).toEqual({ fast: true, n: 42 });
    });
  });

  it('ctx.text() sends plain text', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.text('hello world');
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.headers['content-type']).toBe('text/plain');
      expect(r.body).toBe('hello world');
    });
  });

  it('ctx.html() sends HTML', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.html('<div>SSR</div>');
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.body).toBe('<div>SSR</div>');
    });
  });

  it('ctx.header() chains and adds custom headers', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.header('X-Request-Id', 'abc123')
         .header('X-Custom', 'yes')
         .json({ ok: true });
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.headers['x-request-id']).toBe('abc123');
      expect(r.headers['x-custom']).toBe('yes');
    });
  });

  it('ctx.redirect() sends 302 by default', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.redirect('/new-location');
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(302);
      expect(r.headers['location']).toBe('/new-location');
    });
  });

  it('ctx.redirect() with custom status', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.redirect('/permanent', 301);
    }, async (port) => {
      const r = await makeRequest(port);
      expect(r.status).toBe(301);
    });
  });

  it('ctx.params are typed and accessible', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, { id: '42', name: 'test' }, undefined, {});
      ctx.json({ id: ctx.params.id, name: ctx.params.name });
    }, async (port) => {
      const r = await makeRequest(port);
      expect(JSON.parse(r.body)).toEqual({ id: '42', name: 'test' });
    });
  });

  it('ctx.query is lazily parsed from URL', async () => {
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, {});
      ctx.json(ctx.query);
    }, async (port) => {
      const r = await makeRequest(port, 'GET', '/?foo=bar&n=1');
      expect(JSON.parse(r.body)).toEqual({ foo: 'bar', n: '1' });
    });
  });

  it('ctx.services are injected', async () => {
    const services = { db: { name: 'postgres' } };
    await withServer((req, res) => {
      const ctx = buildNativeContext(req, res, {}, undefined, services as any);
      ctx.json({ db: (ctx.services as any).db.name });
    }, async (port) => {
      const r = await makeRequest(port);
      expect(JSON.parse(r.body)).toEqual({ db: 'postgres' });
    });
  });
});
