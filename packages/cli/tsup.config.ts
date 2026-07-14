import { defineConfig } from 'tsup';

// The CJS bundle require()s ESM-only runtime deps (execa, @clack/prompts,
// @kozojs/core): that works from Node 20.19 (require(esm)). Fail fast with a
// clear message instead of an ERR_REQUIRE_ESM stack on older runtimes.
const nodeFloorCheck = [
  '(() => {',
  '  const [major, minor] = process.versions.node.split(".").map(Number);',
  '  if (major < 20 || (major === 20 && minor < 19)) {',
  '    console.error("@kozojs/cli requires Node >= 20.19 (current: " + process.version + ").");',
  '    process.exit(1);',
  '  }',
  '})();',
].join('\n');

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  minify: false,
  target: 'node20',
  external: ['@kozojs/core'],
  banner: {
    js: '#!/usr/bin/env node\n' + nodeFloorCheck
  },
  outDir: 'lib'
});