-- CreateTable
CREATE TABLE `sync_state` (
    `job` VARCHAR(50) NOT NULL,
    `provider` VARCHAR(10) NOT NULL,
    `stage` INTEGER NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `started_at` DATETIME(0) NULL,
    `finished_at` DATETIME(0) NULL,
    `last_success_at` DATETIME(0) NULL,
    `total` INTEGER NOT NULL DEFAULT 0,
    `processed` INTEGER NOT NULL DEFAULT 0,
    `calls` INTEGER NOT NULL DEFAULT 0,
    `elapsed_ms` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_sync_state_provider`(`provider`, `stage`),
    PRIMARY KEY (`job`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nmc_hospital_subject` (
    `hpid` VARCHAR(20) NOT NULL,
    `subject_cd` VARCHAR(10) NOT NULL,
    `subject_nm` VARCHAR(50) NULL,
    `source` VARCHAR(10) NOT NULL,
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_nmc_hospital_subject_cd`(`subject_cd`),
    PRIMARY KEY (`hpid`, `subject_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hira_hospital_subject` (
    `ykiho` VARCHAR(200) NOT NULL,
    `dgsbjt_cd` VARCHAR(10) NOT NULL,
    `dgsbjt_nm` VARCHAR(50) NULL,
    `sdr_cnt` INTEGER NULL,
    `cdiag_cnt` INTEGER NULL,
    `source` VARCHAR(10) NOT NULL,
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hira_hospital_subject_cd`(`dgsbjt_cd`),
    PRIMARY KEY (`ykiho`, `dgsbjt_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nmc_baby_hospital` (
    `hpid` VARCHAR(20) NOT NULL,
    `data` JSON NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`hpid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
