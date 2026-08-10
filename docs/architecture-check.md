# Architecture check

`kozo check` validates the production conventions without requiring a separate
shared ESLint package.

```bash
kozo check
kozo check --architecture
kozo check --contracts
kozo check --json
```

Blocking codes:

| Code | Rule |
|---|---|
| `KOZO_ARCH001` | route imports a persistence driver |
| `KOZO_ARCH002` | service imports HTTP context/response types |
| `KOZO_ARCH003` | public contract uses `z.any()` |
| `KOZO_ARCH004` | feature deep-imports another feature |
| `KOZO_ARCH005` | `process.env` is read outside config/bootstrap |
| `KOZO_ARCH006` | static route contract is not exported |
| `KOZO_ARCH007` | project lacks typecheck or test scripts |

Warnings cover oversized route/service files, routes without response maps, and
unexplained `z.unknown()` boundaries. Findings include a stable code, severity, file,
line, suggested correction, and documentation link. `--json` is suitable for CI and
editor integrations. A non-zero error count makes the CLI exit non-zero.
