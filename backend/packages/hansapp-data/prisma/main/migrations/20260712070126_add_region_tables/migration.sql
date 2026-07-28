-- CreateTable
CREATE TABLE `nmc_region` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sido_nm` VARCHAR(20) NOT NULL,
    `sggu_nm` VARCHAR(30) NULL,
    `hospital_cnt` INTEGER NOT NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_nmc_region`(`sido_nm`, `sggu_nm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hira_region` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sido_cd` VARCHAR(10) NOT NULL,
    `sido_nm` VARCHAR(20) NULL,
    `sggu_cd` VARCHAR(10) NOT NULL,
    `sggu_nm` VARCHAR(30) NULL,
    `hospital_cnt` INTEGER NOT NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hira_region`(`sido_cd`, `sggu_cd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
