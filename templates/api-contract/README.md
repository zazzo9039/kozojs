# {{PROJECT_NAME}}

Production-oriented Kozo API using feature modules and static route contracts.

```bash
pnpm install
pnpm verify
pnpm dev
```

OpenAPI is available at `/docs`. The `users` feature demonstrates a contract,
transport-free service, static router, contract test, raw negative test, and native
guard smoke test.

## Add a feature

```bash
pnpm kozo generate feature projects --crud --dry-run
pnpm kozo generate feature projects --crud
```

Register the generated service in `src/services.ts`, export its router from
`src/modules/index.ts`, and mount it in `src/app.ts`. Run `pnpm verify` before commit.
