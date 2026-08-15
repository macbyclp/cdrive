-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STAR';
ALTER TYPE "AuditAction" ADD VALUE 'UNSTAR';
ALTER TYPE "AuditAction" ADD VALUE 'PURGE';

-- AlterTable
ALTER TABLE "share_links" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "file_stars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_stars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder_stars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_stars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_stars_userId_fileId_key" ON "file_stars"("userId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "folder_stars_userId_folderId_key" ON "folder_stars"("userId", "folderId");

-- AddForeignKey
ALTER TABLE "file_stars" ADD CONSTRAINT "file_stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_stars" ADD CONSTRAINT "file_stars_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_stars" ADD CONSTRAINT "folder_stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_stars" ADD CONSTRAINT "folder_stars_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
