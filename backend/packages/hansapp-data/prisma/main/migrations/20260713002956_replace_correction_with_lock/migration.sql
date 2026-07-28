/*
  Warnings:

  - You are about to drop the `healthcare_hospital_correction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `healthcare_hospital_correction`;

-- CreateTable
CREATE TABLE `healthcare_hospital_lock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hospital_id` INTEGER NOT NULL,
    `table_name` VARCHAR(50) NOT NULL,
    `key_json` JSON NULL,
    `field` VARCHAR(50) NULL,
    `reason` TEXT NULL,
    `locked_by` VARCHAR(50) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hc_lock_hospital`(`hospital_id`),
    INDEX `idx_hc_lock_table`(`table_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
