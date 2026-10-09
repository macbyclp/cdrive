-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `claudeEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `claudeRoles` VARCHAR(191) NOT NULL DEFAULT 'ADMIN,MANAGER,MEMBER';

-- CreateTable
CREATE TABLE `claude_usage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `day` VARCHAR(191) NOT NULL,
    `inputTokens` BIGINT NOT NULL DEFAULT 0,
    `outputTokens` BIGINT NOT NULL DEFAULT 0,
    `requests` INTEGER NOT NULL DEFAULT 0,
    `chats` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `claude_usage_day_idx`(`day`),
    UNIQUE INDEX `claude_usage_userId_day_key`(`userId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `claude_usage` ADD CONSTRAINT `claude_usage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
