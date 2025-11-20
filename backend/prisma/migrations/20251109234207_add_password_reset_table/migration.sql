/*
  Warnings:
  - You are about to alter the column `ip` on the `PasswordReset` table. Data could be truncated.
*/
-- DropIndex
DROP INDEX `PasswordReset_token_idx` ON `PasswordReset`;

-- AlterTable
ALTER TABLE `PasswordReset` MODIFY `ip` VARCHAR(100) NULL,
    MODIFY `userAgent` VARCHAR(300) NULL;

-- CreateIndex
CREATE INDEX `PasswordReset_expiresAt_idx` ON `PasswordReset`(`expiresAt`);
