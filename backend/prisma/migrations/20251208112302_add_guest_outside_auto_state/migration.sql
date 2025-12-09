-- Add OUTSIDE_AUTO state for guests auto-expelled by system
-- Add expiredAtSystem field for audit trail
ALTER TABLE GuestVisit ADD COLUMN expiredAtSystem DATETIME NULL COMMENT 'Timestamp when auto-expelled by system';

