-- CreateTable
CREATE TABLE `AccessEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subjectType` VARCHAR(32) NOT NULL,
    `userId` INTEGER NULL,
    `guestId` INTEGER NULL,
    `guardId` INTEGER NULL,
    `accessType` ENUM('ENTRY', 'EXIT') NOT NULL,
    `result` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AccessEvent_createdAt_idx`(`createdAt`),
    INDEX `AccessEvent_userId_idx`(`userId`),
    INDEX `AccessEvent_guestId_idx`(`guestId`),
    INDEX `AccessEvent_guardId_idx`(`guardId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AccessEvent` ADD CONSTRAINT `AccessEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessEvent` ADD CONSTRAINT `AccessEvent_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `GuestVisit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessEvent` ADD CONSTRAINT `AccessEvent_guardId_fkey` FOREIGN KEY (`guardId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
