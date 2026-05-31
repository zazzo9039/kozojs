import { describe, it, expect } from 'vitest';
import { defineKozoApp, renderKozoTypesDts } from '../src/kozo-app.js';

describe('defineKozoApp', () => {
  it('exposes types metadata and build()', () => {
    const def = defineKozoApp({
      services: () => ({ ping: true }),
      types: { from: 'src/services.ts', name: 'AppServices' },
    });
    expect(def.types.name).toBe('AppServices');
    expect(typeof def.build).toBe('function');
    expect(def.routesDir).toBe('./src/routes');
  });

  it('renderKozoTypesDts emits module augmentation', async () => {
    const src = await renderKozoTypesDts(
      { from: 'src/lib/services/index.js', name: 'AppServices' },
      '/project',
    );
    expect(src).toContain('interface KozoServices extends AppServices');
    expect(src).toContain("from '../src/lib/services/index.js'");
  });
});
