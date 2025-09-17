-- AlterTable
ALTER TABLE `accesslog` ADD COLUMN `guestId` INTEGER NULL;

-- AlterTable
ALTER TABLE `qrpass` ADD COLUMN `guestId` INTEGER NULL;

-- CreateTable
CREATE TABLE `GuestVisit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `firstName` VARCHAR(191) NOT NULL,
    `lastNameP` VARCHAR(191) NOT NULL,
    `lastNameM` VARCHAR(191) NULL,
    `curp` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `state` ENUM('OUTSIDE', 'INSIDE', 'COMPLETED') NOT NULL DEFAULT 'OUTSIDE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,

    UNIQUE INDEX `GuestVisit_curp_key`(`curp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `QRPass` ADD CONSTRAINT `QRPass_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `GuestVisit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessLog` ADD CONSTRAINT `AccessLog_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `GuestVisit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
