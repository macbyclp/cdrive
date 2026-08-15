-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'UPLOAD', 'DOWNLOAD', 'DELETE', 'RESTORE', 'RENAME', 'MOVE', 'CREATE_FOLDER', 'SHARE_CREATE', 'SHARE_REVOKE', 'PERMISSION_GRANT', 'PERMISSION_REVOKE', 'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'DEPARTMENT_CREATE');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quotaBytes" BIGINT NOT NULL DEFAULT 5368709120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "quotaBytes" BIGINT NOT NULL DEFAULT 2147483648,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departmentId" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "parentId" TEXT,
    "ownerId" TEXT NOT NULL,
    "departmentId" TEXT,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "folderId" TEXT,
    "ownerId" TEXT NOT NULL,
    "currentVersionId" TEXT,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_versions" (
    "id" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_permissions" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "Permission" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder_permissions" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "Permission" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "detail" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");

-- CreateIndex
CREATE INDEX "folders_ownerId_idx" ON "folders"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "files_currentVersionId_key" ON "files"("currentVersionId");

-- CreateIndex
CREATE INDEX "files_folderId_idx" ON "files"("folderId");

-- CreateIndex
CREATE INDEX "files_ownerId_idx" ON "files"("ownerId");

-- CreateIndex
CREATE INDEX "files_name_idx" ON "files"("name");

-- CreateIndex
CREATE UNIQUE INDEX "file_versions_fileId_versionNo_key" ON "file_versions"("fileId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "file_permissions_fileId_userId_key" ON "file_permissions"("fileId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "folder_permissions_folderId_userId_key" ON "folder_permissions"("folderId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "file_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
