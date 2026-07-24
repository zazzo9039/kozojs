/**
 * H2 / F-02 — Degenerate-payload matrix over every exported guard.
 *
 * The bug this closes (F-02): `isSelf` compares `user.sub === paramId` where
 * both sides can be `undefined`. On a route with no `:id` param a token whose
 * payload lacks `sub`/`id` yields `undefined === undefined` → `true`, so the
 * guard grants access. It is reachable through `anyOf(hasRole('admin'), isSelf)`,
 * where `isSelf` is meant to be the *narrower* check.
 *
 * The class matters more than the instance: no exported guard was tested
 * against a degenerate payload, and `hasRole` is safe only by accident of how
 * it was written. So this suite does two things:
 *
 *   1. Enumerates the guards *from the module's live exports* (not a
 *      hand-maintained list) and forces every export to be consciously
 *      classified. A guard added later that nobody wires into the matrix makes
 *      the suite fail — see "export enumeration keeps the matrix honest".
 *   2. Crosses every authorization guard with a matrix of degenerate payloads
 *      and param contexts, asserting uniformly that access is never granted.
 *
 * No secret is committed (00-INDEX guardrail 7): these guards read a user
 * object straight off the context/request, so no signing is involved here.
 */

import { describe, it, expect } from 'vitest';
import * as authModule from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Classification of every runtime export.
//
// Guards are plain functions, structurally indistinguishable from the non-guard
// helpers next to them (and several are factories), so there is no runtime
// signal that says "this export is a guard". Rather than brand the production
// code with a registry, we enumerate the *actual* exports and require every one
// to be classified here. The two tests below then prove (a) nothing is
// unclassified and (b) everything classified as a guard is actually exercised —
// which together mean a newly-added guard cannot slip through uncovered.
// ─────────────────────────────────────────────────────────────────────────────

type Classification =
  | 'guard' //     authorization gate — a degenerate payload must NEVER be granted
  | 'presence' //  authentication presence gate (isAuthenticated); grants any present user
  | 'verifier' //  token verifier — input is a token, not a user payload (covered by guards.test.ts)
  | 'non-guard'; // helper / combinator / re-export

const CLASSIFIED: Record<string, Classification> = {
  // Authorization guards — exercised by the degenerate matrix.
  isSelf: 'guard',
  hasRole: 'guard',
  anyOf: 'guard',
  roleGuard: 'guard',

  // Presence gate — authentication, not authorization.
  isAuthenticated: 'presence',

  // Token verifier — constructs from a secret and checks signatures.
  jwtGuard: 'verifier',

  // Non-guards.
  authenticateJWT: 'non-guard',
  createJWT: 'non-guard',
  decodeJWT: 'non-guard',
  decodeTokenPayload: 'non-guard',
  getUser: 'non-guard',
  canActivate: 'non-guard', // consumes guards, produces middleware — not itself a guard
  registerAuthBeforeLoadRoutes: 'non-guard',
  registerAuthGuard: 'non-guard',
  KozoError: 'non-guard',
  UnauthorizedError: 'non-guard',
};

describe('export enumeration keeps the matrix honest', () => {
  it('every runtime export is classified (a new export fails until triaged)', () => {
    const exported = Object.keys(authModule);
    const unclassified = exported.filter((name) => !(name in CLASSIFIED));
    expect(
      unclassified,
      `Unclassified @kozojs/auth export(s): ${unclassified.join(', ')}. ` +
        `If it is a guard, wire it into MATRIX_GUARDS below; otherwise mark it in CLASSIFIED.`,
    ).toEqual([]);
  });

  it('has no stale classification for an export that no longer exists', () => {
    const exported = new Set(Object.keys(authModule));
    const stale = Object.keys(CLASSIFIED).filter((name) => !exported.has(name));
    expect(stale, `CLASSIFIED lists export(s) that are gone: ${stale.join(', ')}`).toEqual([]);
  });

  it('every export classified as a guard is exercised by the degenerate matrix', () => {
    const declaredGuards = Object.entries(CLASSIFIED)
      .filter(([, kind]) => kind === 'guard')
      .map(([name]) => name)
      .sort();
    const coveredGuards = MATRIX_GUARDS.map((g) => g.name).sort();
    expect(coveredGuards).toEqual(declaredGuards);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures: degenerate payloads and param contexts.
// ─────────────────────────────────────────────────────────────────────────────

/** The degenerate scalar set from the task, used for `sub` and `id`. */
const SCALARS: Array<{ label: string; value: unknown }> = [
  { label: 'undefined', value: undefined },
  { label: 'null', value: null },
  { label: "''", value: '' },
  { label: '0', value: 0 },
  { label: 'false', value: false },
  { label: '{}', value: {} },
];

type UserCase = { label: string; present: boolean; value?: unknown };

const USER_CASES: UserCase[] = [
  { label: 'no user in context', present: false },
  { label: 'user = null', present: true, value: null },
  { label: 'user = {}', present: true, value: {} },
  ...SCALARS.map((s) => ({ label: `{ sub: ${s.label} }`, present: true, value: { sub: s.value } })),
  ...SCALARS.map((s) => ({ label: `{ id: ${s.label} }`, present: true, value: { id: s.value } })),
  ...SCALARS.map((s) => ({
    label: `{ sub: ${s.label}, id: ${s.label} }`,
    present: true,
    value: { sub: s.value, id: s.value },
  })),
];

/** What `c.req.param('id')` / `req.params.id` resolves to. */
const PARAM_CASES: Array<{ label: string; value: string | undefined }> = [
  { label: 'no :id param', value: undefined },
  { label: ':id present but empty', value: '' },
  { label: ':id = concrete value', value: 'real-user-id-999' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Invocation harnesses for the two guard shapes.
//
//   • Hono `Guard`  : (c: Context) => boolean | Response — "granted" iff `=== true`.
//   • `KozoGuard`   : (req: GuardRequest) => GuardResult  — "granted" iff not a deny.
// ─────────────────────────────────────────────────────────────────────────────

function honoCtx(u: UserCase, paramId: string | undefined): any {
  const store = new Map<string, unknown>();
  if (u.present) store.set('user', u.value);
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => void store.set(k, v),
    req: { param: (n: string) => (n === 'id' ? paramId : undefined) },
    // Guards that deny via a Response call this; the sentinel is deliberately
    // not `=== true`, so it reads as "not granted".
    json: (body: unknown, status = 200) => ({ __response: true, status, body }),
  };
}

function nativeReq(u: UserCase, paramId: string | undefined): any {
  return {
    method: 'GET',
    path: '/api/thing',
    url: '/api/thing',
    remoteAddress: '127.0.0.1',
    params: paramId === undefined ? {} : { id: paramId },
    user: u.present ? u.value : null,
    header: () => undefined,
  };
}

const isDeny = (r: any): boolean => !!(r && typeof r === 'object' && 'deny' in r && r.deny);

async function grantsHono(guard: any, u: UserCase, paramId: string | undefined): Promise<boolean> {
  return (await guard(honoCtx(u, paramId))) === true;
}

async function grantsNative(guard: any, u: UserCase, paramId: string | undefined): Promise<boolean> {
  return !isDeny(await guard(nativeReq(u, paramId)));
}

type MatrixGuard = { name: string; kind: 'hono' | 'native'; make: () => any };

/**
 * The authorization guards, each instantiated from the live module export. The
 * enumeration test above asserts this list matches every export classified as a
 * 'guard', so a new guard cannot be added without also landing here.
 */
const MATRIX_GUARDS: MatrixGuard[] = [
  { name: 'isSelf', kind: 'hono', make: () => authModule.isSelf },
  { name: 'hasRole', kind: 'hono', make: () => authModule.hasRole('admin') },
  {
    name: 'anyOf',
    kind: 'hono',
    // The exact composition F-02 calls out: admin OR self, where isSelf is the
    // narrower fallback.
    make: () => authModule.anyOf(authModule.hasRole('admin'), authModule.isSelf),
  },
  { name: 'roleGuard', kind: 'native', make: () => authModule.roleGuard('admin') },
];

async function grants(g: MatrixGuard, u: UserCase, paramId: string | undefined): Promise<boolean> {
  const guard = g.make();
  return g.kind === 'hono' ? grantsHono(guard, u, paramId) : grantsNative(guard, u, paramId);
}

// ─────────────────────────────────────────────────────────────────────────────
// The matrix: no combination of degenerate input grants access.
// ─────────────────────────────────────────────────────────────────────────────

describe('degenerate-payload matrix: access is never granted', () => {
  for (const g of MATRIX_GUARDS) {
    describe(g.name, () => {
      for (const u of USER_CASES) {
        for (const p of PARAM_CASES) {
          it(`denies [${u.label}] with [${p.label}]`, async () => {
            expect(await grants(g, u, p.value)).toBe(false);
          });
        }
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// isAuthenticated is a presence gate, not an authorization gate. It grants any
// present (i.e. signature-verified) payload — asserting identity is isSelf's /
// hasRole's job, not its. We pin that contract so a future "harden
// isAuthenticated" change is a conscious decision rather than a silent one, and
// so the enumeration above has somewhere to point `isAuthenticated`.
// ─────────────────────────────────────────────────────────────────────────────

describe('isAuthenticated (presence gate)', () => {
  it('denies when no user is present', async () => {
    expect(await grantsHono(authModule.isAuthenticated, { label: 'absent', present: false }, undefined)).toBe(
      false,
    );
  });

  it('denies when the user is null', async () => {
    expect(
      await grantsHono(authModule.isAuthenticated, { label: 'null', present: true, value: null }, undefined),
    ).toBe(false);
  });

  it('grants for a present payload — presence is its whole contract', async () => {
    expect(
      await grantsHono(authModule.isAuthenticated, { label: '{}', present: true, value: {} }, undefined),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Success semantics must not regress: a valid principal matching a valid param
// still passes. (These pass both before and after the fix; they are the guard
// rail on the fix, per the task constraint.)
// ─────────────────────────────────────────────────────────────────────────────

describe('success semantics are preserved', () => {
  it('isSelf grants when sub matches the :id param', async () => {
    expect(
      await grantsHono(authModule.isSelf, { label: 'sub=u1', present: true, value: { sub: 'u1' } }, 'u1'),
    ).toBe(true);
  });

  it('isSelf grants when id matches the :id param', async () => {
    expect(
      await grantsHono(authModule.isSelf, { label: 'id=u2', present: true, value: { id: 'u2' } }, 'u2'),
    ).toBe(true);
  });

  it('hasRole grants a matching role (string and array forms)', async () => {
    expect(
      await grantsHono(authModule.hasRole('admin'), { label: 'role', present: true, value: { role: 'admin' } }, undefined),
    ).toBe(true);
    expect(
      await grantsHono(
        authModule.hasRole(['editor', 'admin']),
        { label: 'roles', present: true, value: { roles: ['editor'] } },
        undefined,
      ),
    ).toBe(true);
  });

  it('anyOf(hasRole(admin), isSelf) grants an admin even with no matching :id', async () => {
    const g = authModule.anyOf(authModule.hasRole('admin'), authModule.isSelf);
    expect(await grantsHono(g, { label: 'admin', present: true, value: { role: 'admin' } }, undefined)).toBe(
      true,
    );
  });

  it('anyOf(hasRole(admin), isSelf) grants self on a matching :id', async () => {
    const g = authModule.anyOf(authModule.hasRole('admin'), authModule.isSelf);
    expect(await grantsHono(g, { label: 'self', present: true, value: { sub: 'u9' } }, 'u9')).toBe(true);
  });

  it('roleGuard grants a matching role', async () => {
    expect(
      await grantsNative(authModule.roleGuard('admin'), { label: 'admin', present: true, value: { role: 'admin' } }, undefined),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The reachable exploit, end to end: canActivate(anyOf(hasRole('admin'),
// isSelf)) on a route with no :id param. Pre-fix this calls next() for a
// sub-less token (access granted); post-fix it must deny with 403.
// ─────────────────────────────────────────────────────────────────────────────

describe('F-02 reachable exploit path via canActivate', () => {
  it('does not call next() for a sub-less token on a route with no :id param', async () => {
    const mw = authModule.canActivate(authModule.anyOf(authModule.hasRole('admin'), authModule.isSelf));
    let nextCalled = false;
    const res = await mw(honoCtx({ label: '{}', present: true, value: {} }, undefined), async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect((res as any)?.status).toBe(403);
  });
});
