-- DropForeignKey
ALTER TABLE `accesslog` DROP FOREIGN KEY `AccessLog_userId_fkey`;

-- DropForeignKey
ALTER TABLE `qrpass` DROP FOREIGN KEY `QRPass_userId_fkey`;

-- DropIndex
DROP INDEX `AccessLog_userId_fkey` ON `accesslog`;

-- DropIndex
DROP INDEX `GuestVisit_curp_key` ON `guestvisit`;

-- DropIndex
DROP INDEX `QRPass_userId_fkey` ON `qrpass`;

-- AlterTable
ALTER TABLE `accesslog` MODIFY `userId` INTEGER NULL;

-- AlterTable
ALTER TABLE `qrpass` MODIFY `userId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `GuestVisit_curp_idx` ON `GuestVisit`(`curp`);

-- AddForeignKey
ALTER TABLE `QRPass` ADD CONSTRAINT `QRPass_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessLog` ADD CONSTRAINT `AccessLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
