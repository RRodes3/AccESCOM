/*
  Warnings:

  - You are about to alter the column `ip` on the `passwordreset` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `VarChar(100)`.

*/
-- DropIndex
DROP INDEX `PasswordReset_token_idx` ON `passwordreset`;

-- AlterTable
ALTER TABLE `passwordreset` MODIFY `ip` VARCHAR(100) NULL,
    MODIFY `userAgent` VARCHAR(300) NULL;

-- CreateIndex
CREATE INDEX `PasswordReset_expiresAt_idx` ON `PasswordReset`(`expiresAt`);
