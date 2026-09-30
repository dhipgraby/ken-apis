# Ken Framework APIs (NestJS + Prisma)

This folder contains the backend APIs (NestJS monorepo) plus Prisma (PostgreSQL). The frontends in `../users-app` and `../admin-app` call these services.

## Apps and ports

With `LOCAL_MODE=true`, APIs bind to `127.0.0.1`:

| API | Default URL | Port override |
| --- | --- | --- |
| Auth | `http://127.0.0.1:3001` | `AUTH_PORT` |
| Users | `http://127.0.0.1:3002` | `USERS_PORT` |
| Admin | `http://127.0.0.1:3003` | `ADMIN_PORT` |

Each exposes `/documentation` (Swagger UI) and `/documentation-json` (OpenAPI).
These URLs are available only while the corresponding API is running.

## What’s included

- JWT auth and session validation (Auth API)
- User profile + support endpoints (Users API)
- Admin endpoints (Admin API)
- Prisma ORM + migrations (PostgreSQL)
- Static file serving for uploads from `uploads/`

## Prerequisites

- Node.js 24.20.0 (`.node-version`): tested baseline, not a vendor-support certification
- pnpm 10.11.0 (`packageManager` in `package.json`)
- PostgreSQL (the isolated local runner uses a locally cached `postgres:16` image)
- Optional: Redis (Bull queues) if you enable queue features

## Local quickstart

After the explicit native preparation below, use an environment-file-free fixture
and run `pnpm run test:local` from `ken-apis`. The maintained runner owns a fresh
PostgreSQL database, applies migrations, builds all three APIs and runs the
existing module and actual-process suites before cleanup. It does not install or
prepare dependencies. See the [local runbook](test/README.md) for prerequisites,
manual startup, private mail capture and recovery limits.

Local validation passed 166 tests across 8 suites (including 9 compiled-process
tests) and all 3 API builds, covering actual API startup, documentation,
authentication, authorization and startup failures. The automated run
stops the APIs and database; it leaves no live API URLs.

## Setup

### 1) Install

From this directory, with the pinned Node.js and pnpm versions available:

```bash
pnpm install --frozen-lockfile --ignore-scripts
```

This installs the locked dependency graph without lifecycle scripts. The workspace
requires strict peer dependency checks and approves no dependency builds
(`onlyBuiltDependencies: []`). Do not regenerate the lock to bypass a mismatch.

A successful scripts-off install does **not** verify a normal scripted install,
Prisma generation, native modules (such as bcrypt), or application runtime.
Those require separate validation; no native-package build approvals are supplied.

### 2) Explicit bcrypt native preparation (Linux)

Run this from `ken-apis` **after** the scripts-off install. The tested baseline is
Linux x64 glibc, Node.js 24.20.0, pnpm 10.11.0, bcrypt 5.1.1 and
@mapbox/node-pre-gyp 1.0.11. Targeted provisioning and offline hash/compare passed
in an isolated Linux environment, not the original application runtime; this does
not certify other platforms, services or database support.

Initial provisioning requires HTTPS access to GitHub release assets, including
redirect destinations. This command checks the package's declared host; it does
not enforce an egress allowlist. Version changes stop the procedure for review.
A failed download stops without automatic source-build fallback or blanket
lifecycle-script approvals.

The child environment excludes inherited npm configuration, proxy overrides,
Node options and TLS-disable flags. `NODE_EXTRA_CA_CERTS` is passed only when set:
set it intentionally only to a trusted local CA file, otherwise leave it unset.
Do not bypass TLS verification or change global CA configuration. Corporate proxy
environments may fail and require separately reviewed setup.

```bash
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const bcryptJSON = require.resolve('bcrypt/package.json', { paths: [process.cwd()] });
const bcryptRoot = path.dirname(bcryptJSON);
const preGypJSON = require.resolve('@mapbox/node-pre-gyp/package.json', { paths: [bcryptRoot] });
const bcrypt = readJSON(bcryptJSON);
const preGyp = readJSON(preGypJSON);
if (bcrypt.version !== '5.1.1' || preGyp.version !== '1.0.11') {
  throw new Error('Dependency versions changed; recheck this procedure.');
}
if (bcrypt.binary.host !== 'https://github.com') throw new Error('Unexpected bcrypt binary host.');
// Exclude inherited npm configuration, proxy overrides, NODE_OPTIONS and TLS-disable flags.
const env = {};
for (const key of ['PATH', 'HOME', 'TMPDIR', 'NODE_EXTRA_CA_CERTS']) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
const bin = path.resolve(path.dirname(preGypJSON), preGyp.bin);
const result = spawnSync(process.execPath, [bin, 'install', '--fallback-to-build=false'], {
  cwd: bcryptRoot, env, stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Installer terminated: ${result.signal}`);
process.exit(result.status ?? 1);
NODE
```

Then check the installed binding offline, without starting services or using a database:

```bash
node <<'NODE'
const assert=require('node:assert/strict');
const bcrypt=require('bcrypt');
const hash=bcrypt.hashSync('local-provisioning-check',4);
assert.equal(bcrypt.compareSync('local-provisioning-check',hash),true);
assert.equal(bcrypt.compareSync('different-input',hash),false);
console.log('bcrypt hash/compare passed');
NODE
```

### 3) Environment

For the local path, use an environment-file-free fixture and explicit shell
variables; do not copy existing credentials. The automated runner supplies its
own isolated environment. For manual startup, see the [runbook](test/README.md).

Required:

- `DATABASE_URL` – must be a PostgreSQL URL (Prisma schema uses `provider = "postgresql"`)
- `JWT_SECRET` – used by the JWT strategy

Supported (fallback):

- `JWT_KEY` – accepted by some guards as a fallback if `JWT_SECRET` is not set

Local runtime and mail:

- `LOCAL_MODE=true` – loopback binding and private file mail capture; incompatible with production mode
- `AUTH_PORT`, `USERS_PORT`, `ADMIN_PORT` – optional port overrides
- `AUTH_BASE_URL` – local auth origin for verification links; defaults to `http://127.0.0.1:3001`, so update it when changing the auth port
- `LOCAL_MAIL_DIR` – private capture directory, default `.local/mail` under the working directory; never an HTTP mailbox

Outside local mode mail is disabled by default. Real Resend delivery requires
explicit `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` and `EMAIL_FROM`; it is not used
in this local workflow. `PROD` and `WEBSITE` control production email links.

### 4) Prisma generate / migrate

Before compiling, explicitly generate Prisma Client; the scripts-off install does
not generate it. This requires the installed Prisma 5.22.0 CLI and client, the
project schema, a configured `DATABASE_URL`, writable generated-output directories,
and Prisma engine binaries available locally or permission to download them.
Standard generation may download engine binaries and therefore require HTTPS access.
Generation is separate from installation and does not itself migrate the database.
The isolated Linux native-preparation check above does not verify database support.

```bash
pnpm exec prisma generate
```

Migrations additionally require an accessible PostgreSQL database and permission
to change its schema. For this workflow, set `DATABASE_URL` only to a newly
created, empty local database you own, never an existing database:

```bash
pnpm exec prisma migrate deploy
```

Optional: Prisma Studio

```bash
pnpm run prisma
```

## Run locally

For manual use only, first explicitly migrate your own fresh local database as
above. In each terminal set that same `DATABASE_URL`, a shared synthetic
`JWT_SECRET` and `LOCAL_MODE=true`; keep production settings unset. Then run:

```bash
pnpm run dev-auth
pnpm run dev-users
pnpm run dev-admin
```

## Build / test / lint

After explicit Prisma generation, build each application independently; the
unchanged default `build` script alone is not the three-application check:

```bash
pnpm exec nest build auth
pnpm exec nest build users
pnpm exec nest build admin
```

Successful compilation does not verify services, database connectivity, or native
runtime dependencies. Test and lint remain separate checks (lint modifies files):

```bash
pnpm run lint
pnpm run test
```

## Swagger

Use `/documentation` and `/documentation-json` on each running API's URL from
the table above. Manual signup and verification steps are in the
[local runbook](test/README.md#interactive-session-one-command).

## Troubleshooting (Windows)

- If you see `EPERM` errors during `prisma generate`, stop any running Node processes that might be holding the Prisma engine DLL, then delete `node_modules/.prisma/client` and rerun `pnpm exec prisma generate`.