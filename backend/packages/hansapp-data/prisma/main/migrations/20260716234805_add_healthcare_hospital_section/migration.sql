-- CreateTable
CREATE TABLE `healthcare_hospital_section` (
    `hospital_id` INTEGER NOT NULL,
    `section` VARCHAR(20) NOT NULL,
    `source` VARCHAR(10) NULL,
    `synced_at` DATETIME(0) NULL,
    `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hc_section_synced`(`section`, `synced_at`),
    PRIMARY KEY (`hospital_id`, `section`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
