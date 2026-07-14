-- CreateTable
CREATE TABLE `hira_nmc_link` (
    `ykiho` VARCHAR(200) NOT NULL,
    `hpid` VARCHAR(20) NOT NULL,
    `confirmed_by` VARCHAR(10) NOT NULL,
    `rule` VARCHAR(20) NOT NULL,
    `linked_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `hira_nmc_link_hpid_key`(`hpid`),
    PRIMARY KEY (`ykiho`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hira_nmc_match` (
    `ykiho` VARCHAR(200) NOT NULL,
    `hpid` VARCHAR(20) NULL,
    `status` VARCHAR(15) NOT NULL,
    `rule` VARCHAR(20) NULL,
    `score` DOUBLE NULL,
    `name_sim` DOUBLE NULL,
    `distance_m` INTEGER NULL,
    `evaluated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hira_nmc_match_status`(`status`),
    PRIMARY KEY (`ykiho`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hira_nmc_match_candidate` (
    `ykiho` VARCHAR(200) NOT NULL,
    `hpid` VARCHAR(20) NOT NULL,
    `rank` INTEGER NOT NULL,
    `score` DOUBLE NOT NULL,
    `name_sim` DOUBLE NOT NULL,
    `distance_m` INTEGER NULL,

    INDEX `idx_hira_nmc_candidate_rank`(`ykiho`, `rank`),
    PRIMARY KEY (`ykiho`, `hpid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
