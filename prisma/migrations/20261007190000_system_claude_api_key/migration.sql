-- AlterTable
ALTER TABLE `users` DROP COLUMN `claudeApiKeyEnc`;

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `claudeApiKeyEnc` TEXT NULL;
