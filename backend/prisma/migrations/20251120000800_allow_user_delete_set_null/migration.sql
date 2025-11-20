-- DropForeignKey
ALTER TABLE `qrattempt` DROP FOREIGN KEY `QRAttempt_userId_fkey`;

-- DropIndex
DROP INDEX `QRAttempt_userId_fkey` ON `qrattempt`;

-- AddForeignKey
ALTER TABLE `QRAttempt` ADD CONSTRAINT `QRAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
