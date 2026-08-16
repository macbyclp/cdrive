-- AlterTable
ALTER TABLE `audit_logs` MODIFY `action` ENUM('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'UPLOAD', 'DOWNLOAD', 'DELETE', 'RESTORE', 'RENAME', 'MOVE', 'CREATE_FOLDER', 'SHARE_CREATE', 'SHARE_REVOKE', 'PERMISSION_GRANT', 'PERMISSION_REVOKE', 'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'DEPARTMENT_CREATE', 'DEPARTMENT_UPDATE', 'STAR', 'UNSTAR', 'PURGE', 'TWO_FACTOR_ENABLE', 'TWO_FACTOR_DISABLE', 'PASSWORD_CHANGE') NOT NULL;

-- AlterTable
ALTER TABLE `files` ADD COLUMN `searchText` TEXT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL,
    ADD COLUMN `twoFactorEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `twoFactorSecret` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('SHARE_GRANTED') NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NULL,
    `targetId` VARCHAR(191) NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_read_idx`(`userId`, `read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE FULLTEXT INDEX `files_searchText_idx` ON `files`(`searchText`);

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
