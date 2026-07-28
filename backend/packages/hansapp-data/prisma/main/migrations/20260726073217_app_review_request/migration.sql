-- AlterTable
ALTER TABLE `app` ADD COLUMN `rejection_reason` VARCHAR(500) NULL,
    ADD COLUMN `review_requested_at` DATETIME(3) NULL;
