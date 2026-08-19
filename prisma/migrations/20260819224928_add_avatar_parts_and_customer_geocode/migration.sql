-- AlterTable
ALTER TABLE `customers` ADD COLUMN `lat` DOUBLE NULL,
    ADD COLUMN `lng` DOUBLE NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `avatarParts` TEXT NULL;
