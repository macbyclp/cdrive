-- AlterTable
ALTER TABLE `chat_messages` ADD COLUMN `fileId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
