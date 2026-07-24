/**
 * Known-weak secrets, and the shared "is this secret usable" check.
 *
 * Every literal in {@link KNOWN_WEAK_SECRETS} has been published — in a starter
 * template, a scaffold generator or a docs example — and is therefore public
 * knowledge. A service signing tokens with one of them can have any token,
 * including an admin one, forged by anyone who has read the package.
 *
 * This module is the single place those strings are allowed to appear. A test
 * (`packages/cli/__tests__/no-weak-secrets.test.ts`) asserts they exist nowhere
 * else in the repository.
 *
 * Consumers:
 * - `requireSecret()` in `helpers.ts` — strict, for application startup.
 * - `authenticateJWT()` / `jwtGuard()` in `@kozojs/auth` — construction-time,
 *   so a bad secret fails the boot rather than the first request.
 */

import { createHash } from 'node:crypto';

/**
 * Minimum accepted secret length, in bytes.
 *
 * 32 bytes is the output size of SHA-256 and the point past which HMAC-SHA256
 * gains no further strength from a longer key. Anything shorter is a shorter
 * key than the algorithm it feeds.
 */
export const MIN_SECRET_BYTES = 32;

/** Shell one-liner that produces a secret this module accepts. */
export const GENERATE_SECRET_COMMAND =
  `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`;

/**
 * Secret values that must never protect a running service.
 *
 * Tier 1 — literals shipped inside a released Kozo artefact (starter templates,
 * `.env.example` files, scaffold generators). These are the ones an operator can
 * be running today without knowing it.
 *
 * Tier 2 — placeholders used in Kozo's own documentation and JSDoc examples.
 * Both are below {@link MIN_SECRET_BYTES} and so would be refused in production
 * on length alone; listing them makes them fail in development too, which is
 * where the mistake is actually made.
 *
 * Entries are deliberately unambiguous hyphenated tokens. Bare words like
 * `secret` or `password` are not listed: they are already refused on length,
 * and as blocklist entries they are useless — they match a JSON key, a prose
 * sentence and a database column as readily as a secret, which would make the
 * repository-wide scan that guards this list unusable.
 */
export const KNOWN_WEAK_SECRETS: ReadonlySet<string> = new Set([
  // Tier 1 — shipped in @kozojs/cli <= 0.5.21
  'dev-secret-must-be-at-least-32-characters-long',
  'change-me-to-a-random-secret-at-least-32-chars',
  'change-me-to-a-random-secret',
  'change-me-in-production',
  'change-me',
  // Tier 2 — documentation placeholders
  'my-secret-key',
  'your-secret-key',
]);

/** True when `value` is a secret Kozo has published and must refuse. */
export function isKnownWeakSecret(value: string): boolean {
  return KNOWN_WEAK_SECRETS.has(value);
}

/** UTF-8 byte length of a secret — not `.length`, which counts UTF-16 units. */
export function secretByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * Secrets already warned about, keyed by a truncated SHA-256 so the process does
 * not hold a second copy of the secret alive for the sake of de-duplication.
 */
const warned = new Set<string>();

function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function hint(): string {
  return `  Generate one:  ${GENERATE_SECRET_COMMAND}`;
}

/** Options for {@link assertStrongSecret}. */
export interface AssertStrongSecretOptions {
  /**
   * What supplied the secret, quoted verbatim in the message so the operator can
   * find it — an env var name (`'JWT_SECRET'`) or an API (`'jwtGuard(secret)'`).
   */
  source: string;
  /** Minimum accepted length in bytes. Defaults to {@link MIN_SECRET_BYTES}. */
  minBytes?: number;
  /**
   * What to do with a secret that is merely too short — a known-weak literal is
   * always thrown on, regardless of this setting.
   *
   * - `'throw'` — always reject. Used by `requireSecret()`.
   * - `'auto'`  — reject when `NODE_ENV === 'production'`, otherwise warn once
   *   per distinct secret. Used by the `@kozojs/auth` guards, so that adding the
   *   check does not stop an existing development setup from booting.
   *
   * @default 'auto'
   */
  onShort?: 'throw' | 'auto';
}

/**
 * Throw if `value` cannot be trusted as a signing secret.
 *
 * Call this at construction or startup — never per request. A server that
 * refuses to boot is a fixable incident; one that boots and 500s on request 1
 * is an outage.
 */
export function assertStrongSecret(value: string, options: AssertStrongSecretOptions): void {
  const { source, minBytes = MIN_SECRET_BYTES, onShort = 'auto' } = options;

  if (isKnownWeakSecret(value)) {
    throw new Error(
      `[Kozo] ${source} is set to a secret that ships publicly with Kozo.\n` +
        `  That value is in the published packages, so anyone can forge a token for this service — including an admin one.\n` +
        `  Rotate it now; tokens signed with the old secret must be treated as compromised.\n` +
        hint(),
    );
  }

  const bytes = secretByteLength(value);
  if (bytes >= minBytes) return;

  const problem =
    bytes === 0
      ? `${source} is empty`
      : `${source} is ${bytes} byte${bytes === 1 ? '' : 's'} long; at least ${minBytes} are required`;

  // An empty secret is not "a little short" — it means the variable was never
  // set, and the signing key is zero bytes. Never downgrade that to a warning.
  if (bytes === 0 || onShort === 'throw' || process.env.NODE_ENV === 'production') {
    throw new Error(`[Kozo] ${problem}.\n${hint()}`);
  }

  const id = fingerprint(value);
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(
    `[Kozo] Warning: ${problem}.\n` +
      `  This is tolerated because NODE_ENV is not 'production'. It will throw there.\n` +
      hint(),
  );
}
