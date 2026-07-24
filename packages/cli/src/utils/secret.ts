import { randomBytes } from 'node:crypto';

/**
 * Secret handling for scaffolded projects.
 *
 * Scaffolders must never write a literal secret into a generated project: the
 * generator is published to npm, so any literal it contains is public knowledge
 * the moment it ships. Generated code reads its secret through
 * `requireSecret()` from `@kozojs/core`, which has no fallback, and the local
 * `.env` gets a value minted here, on the user's machine.
 *
 * Defined locally rather than imported from `@kozojs/core` so the CLI keeps its
 * single runtime edge to that package (a `require(esm)` hop) for the things
 * that actually need it.
 */

/** Shell one-liner that mints a secret `requireSecret()` will accept. */
export const GENERATE_SECRET_COMMAND =
  `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`;

/**
 * Mint a secret for a project being scaffolded on this machine.
 *
 * 48 random bytes → 64 base64url characters, comfortably over the 32-byte floor
 * `requireSecret()` enforces, and safe to paste into a `.env` unquoted.
 */
export function generateSecret(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Comment block for the `JWT_SECRET` entry of a generated `.env.example`.
 * `.env.example` is committed by the user, so it must carry no value at all —
 * only the instructions for producing one.
 */
export const ENV_SECRET_HELP = [
  '# Required — no default. The app refuses to start without it.',
  '# Generate one and paste it below:',
  `#   ${GENERATE_SECRET_COMMAND}`,
  '# Use a different value per environment, and never commit the filled-in .env.',
].join('\n');
