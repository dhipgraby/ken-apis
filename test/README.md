# Local backend runbook

Use the maintained runner from `ken-apis` in a prepared, environment-file-free
fixture:

```bash
pnpm run test:local
```

Local validation passed 166 tests across 8 suites (including 9 compiled-process
tests) and all 3 API builds, covering actual API startup, documentation,
authentication, authorization and startup failures.

## Prerequisites and ownership

- Linux with `/proc`, Bash, GNU `timeout`, Node.js 24.20.0 and pnpm 10.11.0.
- Working Docker through a local Unix socket and a locally cached `postgres:16`
  image. Remote Docker endpoints are refused; the runner does not pull images.
- Locked dependencies already installed, host-compatible Prisma CLI/native
  engines, Prisma Client generated for this schema, and bcrypt explicitly
  prepared. Follow the [native preparation instructions](../README.md#setup);
  do not rename engine binaries to hide a platform mismatch.
- Neither `.env` nor `prisma/.env` may exist (including symlinks). Unset inherited
  `DATABASE_URL`; do not copy real credentials into the fixture. The runner checks
  file existence, not contents, and uses a sanitized child environment.

The runner performs no installation, client generation or dependency downloads.
It creates a uniquely labelled disposable PostgreSQL container with synthetic
credentials, checks that its database is empty, applies `prisma migrate deploy`
and checks schema drift. Never substitute an existing database. URL validation
alone is not proof of ownership.

## What the runner exercises

`test/local-readiness.sh` builds auth, users and admin independently, then runs
`test:e2e` with the existing module suites and the gated compiled-process suite.
The latter starts actual API processes and checks Swagger UI/assets and OpenAPI,
password signup and private mail capture, verification and protected access,
admin login and database-backed demotion, and startup failure cases. Google
provider behavior is tested with fixtures, not live Google calls. The first admin
is a private automated fixture only: not public signup and not a production
bootstrap procedure.

The runner checks fixture-row cleanup and recovers registered API processes
before stopping its owned database. **It is not a persistent development server:**
after completion there are no live API URLs. Private recovery metadata and build
logs are retained at the printed path.

## Manual use

For an interactive session, use the same prepared, environment-file-free setup,
but provision a separate **fresh, empty local database you own**. Do not reuse an
existing database or the automated runner's already-removed database. In each
terminal supply its `DATABASE_URL`, the same synthetic `JWT_SECRET`, and
`LOCAL_MODE=true`; leave production settings unset. From `ken-apis`, explicitly
apply migrations before startup:

```bash
pnpm exec prisma migrate deploy
```

Then run one existing script per terminal:

```bash
pnpm run dev-auth
pnpm run dev-users
pnpm run dev-admin
```

Local mode binds to `127.0.0.1`. Auth/users/admin default to ports 3001/3002/3003;
`AUTH_PORT`, `USERS_PORT` and `ADMIN_PORT` override them. Each API exposes
`/documentation` and `/documentation-json`. Set `AUTH_BASE_URL` to the auth
loopback origin if changing its port (default `http://127.0.0.1:3001`). Local mode
is rejected with `PROD=true` or `NODE_ENV=production`.

1. Use Auth Swagger to submit standard password signup. The account starts at
   status `0` (pending), not as an admin.
2. Read the captured JSON file's `text` field in `LOCAL_MAIL_DIR` (default
   `.local/mail` relative to the API working directory). Open its verification
   URL: `GET /auth/verify?token=...`. A valid code changes pending status `0` to
   active status `1`.
3. Log in and use the returned bearer token for protected Auth `/auth/user` and
   Users `/user/me` requests. A normal user cannot access admin-only routes.

Mail capture is private local filesystem storage, **not an HTTP mailbox**; keep
it outside uploads/public directories and do not share tokens or capture files.
A new Google signup with a verified provider identity starts active (`1`);
verification/sign-in does not reactivate denied or banned accounts. Real Google
access is not part of this isolated workflow.

Mail is disabled by default outside local mode. Real Resend delivery requires
explicit `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` and `EMAIL_FROM`; it is not used
here. Stop manually started APIs yourself and retire only your owned disposable
database after use.

## Recovery and limits

On normal exit, failure, SIGINT or SIGTERM, cleanup attempts identity-checked
recovery of registered API process groups and the uniquely owned container.
Inspect the printed owner, retained process registry, Docker endpoint and CID
file before recovering that exact resource; never bulk-delete containers or
reuse an unknown database. Cleanup failures remain failures.

SIGKILL, host loss and Docker-daemon failure cannot be repaired by a shell trap.
A signal between process spawn and registration leaves an unregistered-spawn
gap; recovery is not guaranteed. The test-only network guard covers selected
JavaScript HTTP/HTTPS/fetch transports, not native Prisma/Rust sockets or every
possible transport. It is not an OS-level network sandbox or a security proof.
