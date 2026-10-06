-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('SHARE_GRANTED', 'QUOTA_WARNING', 'ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'PAYMENT_RECORDED', 'ORDER_OVERDUE', 'CHAT_DM', 'CHAT_MENTION', 'APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'UPLOAD_RECEIVED') NOT NULL;

-- CreateTable
CREATE TABLE `upload_requests` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `maxFiles` INTEGER NOT NULL DEFAULT 20,
    `maxFileBytes` BIGINT NOT NULL DEFAULT 52428800,
    `uploadCount` INTEGER NOT NULL DEFAULT 0,
    `revoked` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `upload_requests_token_key`(`token`),
    INDEX `upload_requests_folderId_idx`(`folderId`),
    INDEX `upload_requests_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `upload_requests` ADD CONSTRAINT `upload_requests_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upload_requests` ADD CONSTRAINT `upload_requests_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
