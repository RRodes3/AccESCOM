-- Add OUTSIDE_AUTO state for guests auto-expelled by system
-- Add expiredAtSystem field for audit trail

-- Modify the GuestState enum to include OUTSIDE_AUTO
ALTER TABLE `GuestVisit` MODIFY `state` ENUM('OUTSIDE', 'INSIDE', 'COMPLETED', 'OUTSIDE_AUTO') NOT NULL DEFAULT 'OUTSIDE';

-- Add expiredAtSystem column for audit trail
ALTER TABLE `GuestVisit` ADD COLUMN `expiredAtSystem` DATETIME NULL COMMENT 'Timestamp when auto-expelled by system';
