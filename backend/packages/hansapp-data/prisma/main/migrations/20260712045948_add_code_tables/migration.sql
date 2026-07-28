-- CreateTable
CREATE TABLE `nmc_code` (
    `cm_mid` VARCHAR(20) NOT NULL,
    `cm_sid` VARCHAR(20) NOT NULL,
    `cm_mnm` VARCHAR(100) NULL,
    `cm_snm` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_nmc_code_snm`(`cm_snm`),
    PRIMARY KEY (`cm_mid`, `cm_sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hira_code` (
    `tp` VARCHAR(20) NOT NULL,
    `tp_nm` VARCHAR(50) NOT NULL,
    `cd` VARCHAR(20) NOT NULL,
    `cd_nm` VARCHAR(200) NULL,
    `cd_cmt` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hira_code_nm`(`cd_nm`),
    PRIMARY KEY (`tp`, `cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
