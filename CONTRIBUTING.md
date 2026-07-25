# Contributing to Kozo

Thanks for your interest in Kozo. This is a monorepo (`pnpm` workspaces) publishing the `@kozojs/*` packages.

## Prerequisites

- **Node.js** ≥ 20.19
- **pnpm** 9.x (see `packageManager` in root `package.json`)

```bash
git clone https://github.com/zazzo9039/kozojs.git
cd kozo
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Development workflow

1. **Branch** from `main` — use a descriptive name (`fix/…`, `feat/…`, `docs/…`).
2. **Change the smallest surface** that fixes the issue; match existing style and tests.
3. **Run tests** for packages you touch (`pnpm --filter @kozojs/core test`, etc.).
4. **Update `CHANGELOG.md`** in the affected package(s) when the change is user-visible.
5. **Open a PR** against `main` with a clear summary and test plan.

### Core (`@kozojs/core`)

- Source: `packages/core/src/` — built output `packages/core/lib/` is committed; run `pnpm --filter @kozojs/core build` after `src/` changes.
- Transport parity: when changing `listen()` or `nativeListen()` behaviour, extend `packages/core/__tests__/transport-parity.test.ts` if uWebSockets.js is available in CI.

### Other packages

Each package under `packages/` has its own `package.json`, tests, and build script. See package READMEs for scope.

## Commit messages

Use imperative, scoped subjects when possible:

```
fix(core): return 400 on malformed SSR static URLs
docs(cli): correct uWebSockets.js install instructions
```

## Pull requests

- Keep PRs focused — one logical change per PR when possible.
- CI must pass (build, typecheck, tests on Node 20/22/24).
- Do not bump npm versions unless maintainers ask for a release PR.

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting — **no public issues for security bugs**.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
