/**
 * Vitest global setup
 *
 * Vitest 2.x replaces globalThis.console with a custom Console instance whose
 * methods are inherited from Console.prototype.  tinyspy (used by vi.spyOn)
 * reads the prototype descriptor and – when it rewrites the property on the
 * instance – may produce a spy that the engine still short-circuits through the
 * prototype chain under certain Node.js versions.
 *
 * Pinning each console method as an OWN, configurable, writable property on the
 * instance before tests run ensures that vi.spyOn(console, 'log') creates a
 * proper own-property spy that intercepts calls correctly.
 */

const CONSOLE_METHODS = [
  'log', 'info', 'debug', 'warn', 'error', 'trace',
  'group', 'groupEnd', 'groupCollapsed',
  'time', 'timeEnd', 'timeLog',
  'count', 'countReset',
  'assert', 'dir', 'table',
] as const;

for (const method of CONSOLE_METHODS) {
  const original = (console as any)[method];
  if (typeof original === 'function') {
    Object.defineProperty(console, method, {
      value: original.bind(console),
      configurable: true,
      writable: true,
      enumerable: false,
    });
  }
}
