/*
  Warnings:

  - You are about to alter the column `role` on the `user` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(2))` to `VarChar(191)`.

*/
-- DropIndex
DROP INDEX `User_email_idx` ON `user`;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `institutionalType` ENUM('STUDENT', 'TEACHER', 'PAE') NULL,
    MODIFY `role` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `User_role_idx` ON `User`(`role`);

-- CreateIndex
CREATE INDEX `User_institutionalType_idx` ON `User`(`institutionalType`);
