-- AlterTable
ALTER TABLE `audit_logs` MODIFY `action` ENUM('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'UPLOAD', 'DOWNLOAD', 'DELETE', 'RESTORE', 'RENAME', 'MOVE', 'CREATE_FOLDER', 'SHARE_CREATE', 'SHARE_REVOKE', 'PERMISSION_GRANT', 'PERMISSION_REVOKE', 'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'DEPARTMENT_CREATE', 'DEPARTMENT_UPDATE', 'STAR', 'UNSTAR', 'PURGE', 'TWO_FACTOR_ENABLE', 'TWO_FACTOR_DISABLE', 'PASSWORD_CHANGE', 'SESSION_REVOKE', 'SETTINGS_UPDATE', 'AUTO_CLEANUP', 'ORDER_CREATE', 'ORDER_STATUS_UPDATE') NOT NULL;

-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('SHARE_GRANTED', 'QUOTA_WARNING', 'ORDER_CREATED', 'ORDER_STATUS_CHANGED') NOT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `canCreateOrders` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `canManageOrders` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerContact` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'INVOICED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `accountingNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    INDEX `orders_status_idx`(`status`),
    INDEX `orders_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(12, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `order_attachments_orderId_fileId_key`(`orderId`, `fileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_attachments` ADD CONSTRAINT `order_attachments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_attachments` ADD CONSTRAINT `order_attachments_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
