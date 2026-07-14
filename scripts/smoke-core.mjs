/**
 * Smoke test for the published @kozojs/core tarball.
 *
 * Must run inside an EMPTY project where the package was installed from the
 * packed tarball (see .github/workflows/ci.yml pack/smoke jobs) — never from the
 * workspace, otherwise pnpm's symlinks hide packaging bugs like the
 * `workspace:*` protocol leak that broke @kozojs/cli 0.5.9–0.5.10 on npm.
 *
 * Local run:
 *   cd $(mktemp -d) && npm init -y
 *   npm i /path/to/kozojs-core-x.y.z.tgz
 *   cp /path/to/repo/scripts/smoke-core.mjs . && node smoke-core.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createKozo, defineRoute, KOZO_CONFIG_CANDIDATES } from '@kozojs/core';

// engines >=20.19 makes require(esm) part of the public contract: the
// "default" export condition must serve CJS consumers too.
const require = createRequire(import.meta.url);
const viaRequire = require('@kozojs/core');
assert.equal(typeof viaRequire.createKozo, 'function', 'require("@kozojs/core") did not resolve');

assert.equal(typeof createKozo, 'function', 'missing export: createKozo');
assert.equal(typeof defineRoute, 'function', 'missing export: defineRoute');
// The export whose import made the CLI depend on core starting from 0.5.9.
assert.ok(
  Array.isArray(KOZO_CONFIG_CANDIDATES) && KOZO_CONFIG_CANDIDATES.length > 0,
  'missing export: KOZO_CONFIG_CANDIDATES',
);

const app = createKozo();
app.get('/ping', () => ({ pong: true }));

const ok = await app.fetch(new Request('http://smoke.test/ping'));
assert.equal(ok.status, 200, `GET /ping returned ${ok.status}`);
assert.deepEqual(await ok.json(), { pong: true });

const missing = await app.fetch(new Request('http://smoke.test/nope'));
assert.equal(missing.status, 404, `GET /nope returned ${missing.status}, expected 404`);

console.log(`ok - @kozojs/core smoke passed (node ${process.version})`);
