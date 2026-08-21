-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `mailFrom` VARCHAR(191) NULL,
    ADD COLUMN `smtpHost` VARCHAR(191) NULL,
    ADD COLUMN `smtpPass` VARCHAR(191) NULL,
    ADD COLUMN `smtpPort` INTEGER NULL,
    ADD COLUMN `smtpUser` VARCHAR(191) NULL;
