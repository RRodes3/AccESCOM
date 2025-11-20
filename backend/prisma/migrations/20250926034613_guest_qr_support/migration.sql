-- DropForeignKey
ALTER TABLE `AccessLog` DROP FOREIGN KEY `AccessLog_userId_fkey`;
ALTER TABLE `QRPass` DROP FOREIGN KEY `QRPass_userId_fkey`;

-- DropIndex
DROP INDEX `AccessLog_userId_fkey` ON `AccessLog`;
DROP INDEX `GuestVisit_curp_key` ON `GuestVisit`;
DROP INDEX `QRPass_userId_fkey` ON `QRPass`;

-- AlterTable
ALTER TABLE `AccessLog` MODIFY `userId` INTEGER NULL;
ALTER TABLE `QRPass` MODIFY `userId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `GuestVisit_curp_idx` ON `GuestVisit`(`curp`);

-- AddForeignKey
ALTER TABLE `QRPass` ADD CONSTRAINT `QRPass_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AccessLog` ADD CONSTRAINT `AccessLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
