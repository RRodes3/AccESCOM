/*
  Warnings:
  - You are about to alter the column `role` on the `User` table.
*/
-- DropIndex
DROP INDEX `User_email_idx` ON `User`;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `institutionalType` ENUM('STUDENT','TEACHER','PAE') NULL,
    MODIFY `role` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `User_role_idx` ON `User`(`role`);
CREATE INDEX `User_institutionalType_idx` ON `User`(`institutionalType`);
