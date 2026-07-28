-- CreateTable
-- 계열이 안 맞아 통합 테이블에서 제외한 진료과목. 버리지 않고 남겨 사람이 확인한다.
CREATE TABLE `healthcare_subject_mismatch` (
    `hospital_id` INTEGER NOT NULL,
    `subject_cd` VARCHAR(30) NOT NULL,
    `class_cd` VARCHAR(20) NOT NULL,
    `ykiho` VARCHAR(200) NULL,
    `hpid` VARCHAR(20) NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'open',
    `memo` TEXT NULL,
    `first_seen_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_seen_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX `idx_hc_mismatch_status`(`status`, `last_seen_at`),
    PRIMARY KEY (`hospital_id`, `subject_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
