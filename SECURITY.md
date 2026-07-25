# Security Policy

## Supported versions

Security fixes are released for the latest **`0.5.x`** line on npm. Older minors may receive backports at maintainer discretion — pin and upgrade when in doubt.

| Version | Supported |
|---------|-----------|
| `0.5.x` (latest) | Yes |
| `0.4.x` and below | No |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

1. Open a **[private security advisory](https://github.com/zazzo9039/kozojs/security/advisories/new)** on this repository, **or**
2. Email the maintainers via the contact on the [GitHub profile](https://github.com/zazzo9039) with:
   - Affected package(s) and version(s)
   - Steps to reproduce
   - Impact assessment (if known)
   - Suggested fix (optional)

We aim to acknowledge reports within **72 hours** and to ship a fix or mitigation plan within **14 days** for confirmed issues in supported versions.

## Disclosure

We follow coordinated disclosure: we will work with you on timing before any public announcement. Fixed issues are documented in each package `CHANGELOG.md` and, when applicable, in [docs/common-pitfalls.md](./docs/common-pitfalls.md).

## Known historical issues

- **0.5.15 and earlier — uWS middleware bypass:** `nativeListen()` could skip `app.middleware()` / `_middleware.ts` on uncovered routes. Fixed in **0.5.16+** via the guard system and Hono bridge. See CHANGELOG `[0.5.16]`.
