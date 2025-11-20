-- DropForeignKey
ALTER TABLE `QRAttempt` DROP FOREIGN KEY `QRAttempt_userId_fkey`;

-- (DROP INDEX sólo si realmente existe; si Prisma lo generó diferente puedes omitir)
-- DropIndex
-- DROP INDEX `QRAttempt_userId_fkey` ON `QRAttempt`;

-- AddForeignKey
ALTER TABLE `QRAttempt` ADD CONSTRAINT `QRAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
