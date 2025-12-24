# Ken Framework APIs (NestJS + Prisma)

This folder contains the backend APIs (NestJS monorepo) plus Prisma (PostgreSQL). The frontends in `../users-app` and `../admin-app` call these services.

## Apps and ports

- Auth API: `http://localhost:3001` (Swagger: `/documentation`)
- Users API: `http://localhost:3002` (Swagger: `/documentation`)
- Admin API: `http://localhost:3003` (Swagger: `/documentation`)

## What’s included

- JWT auth and session validation (Auth API)
- User profile + support endpoints (Users API)
- Admin endpoints (Admin API)
- Prisma ORM + migrations (PostgreSQL)
- Static file serving for uploads from `uploads/`

## Prerequisites

- Node.js 18+
- PostgreSQL 15+ (or run the repo-root Docker compose)
- Optional: Redis (Bull queues) if you enable queue features

## Database (recommended)

From repo root, start Postgres:

```bash
docker compose up -d
```

The default compose uses:

- Host: `localhost`
- Port: `5432`
- User: `postgres`
- Password: `password`
- DB: `ken_framework_db`

## Setup

### 1) Install

```bash
npm install
```

### 2) Environment

Create `backend-apis/.env` (you can start from `.env.example`).

Required:

- `DATABASE_URL` – must be a PostgreSQL URL (Prisma schema uses `provider = "postgresql"`)
- `JWT_SECRET` – used by the JWT strategy

Supported (fallback):

- `JWT_KEY` – accepted by some guards as a fallback if `JWT_SECRET` is not set

Email/support flows (optional):

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `PROD` – set to `true` in production
- `WEBSITE` – production website base URL (used in email templates when `PROD=true`)

### 3) Prisma migrate

```bash
npx prisma migrate dev
```

Optional: Prisma Studio

```bash
npm run prisma
```

## Run locally

In separate terminals:

```bash
npm run dev-auth
npm run dev-users
npm run dev-admin
```

## Build / test / lint

```bash
npm run build
npm run lint
npm run test
```

## Swagger

Each service exposes Swagger at `/documentation`:

- `http://localhost:3001/documentation`
- `http://localhost:3002/documentation`
- `http://localhost:3003/documentation`

## Troubleshooting (Windows)

- If you see `EPERM` errors during `prisma generate`, stop any running Node processes that might be holding the Prisma engine DLL, then delete `node_modules/.prisma/client` and rerun `npx prisma generate`.