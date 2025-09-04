# Ken API
 Microservices app, admin and website.
 Build with Nest.js 

# 🚀 Microservices App Documentation

## Auth Module

### 👤 `users.controller.ts`

#### Endpoints:

Add localhost:3001 before each endpoint or production URL.

- `POST /auth/signup`: Create a new user.
- `POST /auth/login`: User login.
- `GET /auth/user`: Retrieve user information (requires authentication).

## Prisma

### 🛠️ `schema.prisma`

## 📝 Instalation

### Commands
- `yarn` or `npm install`
- create `.env` and copy `.env.example` content
- Init prisma db  `npx prisma init`
- Generate prisma files  `npx prisma generate`

### Running services
localhost 
- Auth API Serivce : `yarn start-auth`  (port 3001)
- Users API Serivce : `yarn start-users` (port 3002)
- Admin API Serivce : `yarn start-admin` (port 3005)

Note:

For more information please contact at kenneth.solidity@gmail.com