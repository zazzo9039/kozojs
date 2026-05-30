import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'middleware/index': 'src/middleware/index.ts'
  },
  outDir: 'lib',
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
});
