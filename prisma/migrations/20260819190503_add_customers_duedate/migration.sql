-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('SHARE_GRANTED', 'QUOTA_WARNING', 'ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'PAYMENT_RECORDED', 'ORDER_OVERDUE') NOT NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `dueDate` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contact` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `customers_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `orders_customerId_idx` ON `orders`(`customerId`);

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
