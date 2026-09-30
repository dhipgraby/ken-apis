-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "password" TEXT NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 0,
    "userStatus" INTEGER NOT NULL DEFAULT 0,
    "last_login" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_modified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInfo" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "job_type" INTEGER NOT NULL DEFAULT 0,
    "job_title" TEXT,
    "leaves_entitled_to" INTEGER NOT NULL DEFAULT 0,
    "country" TEXT,
    "logoUrl" TEXT,
    "line_manager" TEXT,
    "last_modified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorCode" (
    "id" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TwoFactorCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserInfo_userId_key" ON "UserInfo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCode_code_key" ON "EmailCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCode_email_key" ON "EmailCode"("email");

-- AddForeignKey
ALTER TABLE "UserInfo" ADD CONSTRAINT "UserInfo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
