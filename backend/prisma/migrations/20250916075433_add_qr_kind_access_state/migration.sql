/*
  Warnings:

  - You are about to drop the column `deletedAt` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `AccessLog` ADD COLUMN `kind` ENUM('ENTRY', 'EXIT') NULL;

-- AlterTable
ALTER TABLE `QRPass` ADD COLUMN `kind` ENUM('ENTRY', 'EXIT') NOT NULL DEFAULT 'ENTRY';

-- AlterTable
ALTER TABLE `User` DROP COLUMN `deletedAt`,
    ADD COLUMN `accessState` ENUM('INSIDE', 'OUTSIDE') NOT NULL DEFAULT 'OUTSIDE',
    MODIFY `boleta` VARCHAR(191) NULL,
    MODIFY `firstName` VARCHAR(191) NULL,
    MODIFY `lastNameM` VARCHAR(191) NULL,
    MODIFY `lastNameP` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `User_email_idx` ON `User`(`email`);
