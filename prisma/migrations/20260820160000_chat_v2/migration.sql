-- AlterTable
ALTER TABLE `chat_channels` ADD COLUMN `isPrivate` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `chat_messages` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `editedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('SHARE_GRANTED', 'QUOTA_WARNING', 'ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'PAYMENT_RECORDED', 'ORDER_OVERDUE', 'CHAT_DM', 'CHAT_MENTION') NOT NULL;

-- CreateTable
CREATE TABLE `chat_channel_members` (
    `id` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `chat_channel_members_channelId_userId_key`(`channelId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_channel_members` ADD CONSTRAINT `chat_channel_members_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `chat_channels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_channel_members` ADD CONSTRAINT `chat_channel_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
