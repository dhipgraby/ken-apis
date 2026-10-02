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

## Interactive session: one command

After completing the prerequisites above, run from `ken-apis`:

```bash
pnpm run dev:local
```

`scripts/dev-local.cjs` creates its own fresh, empty PostgreSQL database, applies
migrations, seeds one fake local admin, builds all three APIs once, and keeps
them running in the foreground. **There is no watcher.** No installation,
generation, image pull or automated test run occurs; `pnpm run test:local` remains
separate. Unset `DATABASE_URL`, `PROD=true` and `NODE_ENV=production` first.

All listeners bind to `127.0.0.1`, with fixed defaults: Auth `3011`, Users `3012`,
and Admin `3033`. Override them with `AUTH_PORT`, `USERS_PORT`, and `ADMIN_PORT`;
explicit `0` requests an allocated port. The launcher prints
three Swagger URLs only after their owned processes report post-listen readiness;
each also exposes `/documentation-json`. Auth sets its own verification-link
origin. No existing listener is probed or reused.

Private logs, metadata, network audit and the shared `outbox` are retained under
`.local/session-<nonce>` (directory mode `0700`, private JSON mode `0600`). Read
the printed `admin-credentials.json` path for the synthetic admin login; the
password is not printed. This fixture is not a public signup privilege or a
production admin bootstrap. No real Resend key or Google ID is supplied.

1. Use Auth Swagger to submit standard password signup. The account starts at
   status `0` (pending), not as an admin.
2. Read the captured JSON file's `text` field in the printed session `outbox`.
   Open its verification
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
here.

**Stop with Ctrl+C** (or SIGTERM): the supervisor recovers only registered owned
API process groups and discards only its fresh database. The private outbox and
metadata remain on disk. An unexpected API exit also stops the session and fails
rather than leaving a partially live stack.

For another terminal or handoff recovery, use the exact absolute command printed
at startup (including the Node executable and launcher path):

```bash
node scripts/dev-local.cjs --stop /absolute/path/to/ken-apis/.local/session-<nonce>
```

The stop command validates private metadata, project identity, registry and
container ownership. A live supervisor receives a private stop request; recovery
uses the existing identity-checked helper if that supervisor is absent. Unknown
identities fail closed; a cleanup failure requires inspection, not bulk deletion.

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
