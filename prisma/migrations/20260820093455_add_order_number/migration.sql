-- AlterTable
ALTER TABLE `orders` ADD COLUMN `orderNumber` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `orders_orderNumber_key` ON `orders`(`orderNumber`);
