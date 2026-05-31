import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  minify: false,
  target: 'node14',
  external: ['@kozojs/core'],
  banner: {
    js: '#!/usr/bin/env node'
  },
  outDir: 'lib'
});