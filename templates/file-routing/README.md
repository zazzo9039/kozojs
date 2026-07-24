# {{PROJECT_NAME}}

File-routing starter: `_middleware.ts`, JWT auth, dynamic `[id]` routes, admin role guard.

## Quick start

```bash
pnpm install
cp .env.example .env
# Fill in JWT_SECRET — there is no default and the app will not start without one:
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
pnpm dev
```

`JWT_SECRET` must be at least 32 bytes, different in every environment, and must
never be committed. Anything signed with a leaked secret can be forged, so if one
does leak, rotate it — every token issued before the rotation is compromised.

See the Kozo repo `examples/file-routing/README.md` for curl examples.

Default users:
- `admin@example.com` / `admin123` (admin)
- `bob@example.com` / `user123` (user)
