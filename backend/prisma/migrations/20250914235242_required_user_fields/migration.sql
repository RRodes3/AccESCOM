/*
  Warnings:

  - A unique constraint covering the columns `[boleta]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `boleta` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastNameM` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastNameP` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `User_email_idx` ON `user`;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `boleta` VARCHAR(191) NOT NULL,
    ADD COLUMN `firstName` VARCHAR(191) NOT NULL,
    ADD COLUMN `lastNameM` VARCHAR(191) NOT NULL,
    ADD COLUMN `lastNameP` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_boleta_key` ON `User`(`boleta`);
