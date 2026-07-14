-- CreateTable
CREATE TABLE `healthcare_code` (
    `tp` VARCHAR(20) NOT NULL,
    `cd` VARCHAR(30) NOT NULL,
    `nm` VARCHAR(100) NOT NULL,
    `cmt` TEXT NULL,
    `hira_cd` JSON NULL,
    `nmc_cd` JSON NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_healthcare_code_sort`(`tp`, `sort`),
    PRIMARY KEY (`tp`, `cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `region_code` (
    `cd` VARCHAR(10) NOT NULL,
    `nm` VARCHAR(50) NOT NULL,
    `level` VARCHAR(10) NOT NULL,
    `parent_cd` VARCHAR(10) NULL,
    `hira_cd` JSON NULL,
    `nmc_nm` JSON NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_region_code_level`(`level`, `sort`),
    INDEX `idx_region_code_parent`(`parent_cd`),
    PRIMARY KEY (`cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
