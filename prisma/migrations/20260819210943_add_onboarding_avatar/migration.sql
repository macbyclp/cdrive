-- AlterTable
ALTER TABLE `users` ADD COLUMN `avatarKey` VARCHAR(191) NULL,
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false;
