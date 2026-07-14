-- CreateTable
CREATE TABLE `healthcare_hospital` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ykiho` VARCHAR(200) NULL,
    `hpid` VARCHAR(20) NULL,
    `source` VARCHAR(10) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `addr` VARCHAR(300) NULL,
    `tel` VARCHAR(30) NULL,
    `homepage` VARCHAR(300) NULL,
    `class_cd` VARCHAR(30) NULL,
    `region_cd` VARCHAR(10) NULL,
    `emdong_nm` VARCHAR(30) NULL,
    `post_no` VARCHAR(10) NULL,
    `lat` DECIMAL(10, 7) NULL,
    `lon` DECIMAL(10, 7) NULL,
    `estb_dd` VARCHAR(10) NULL,
    `emergency_yn` BOOLEAN NOT NULL DEFAULT false,
    `baby_yn` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(10) NOT NULL DEFAULT 'active',
    `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `healthcare_hospital_ykiho_key`(`ykiho`),
    UNIQUE INDEX `healthcare_hospital_hpid_key`(`hpid`),
    INDEX `idx_hc_hospital_region`(`region_cd`, `class_cd`),
    INDEX `idx_hc_hospital_name`(`name`),
    INDEX `idx_hc_hospital_status`(`status`),
    INDEX `idx_hc_hospital_source`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healthcare_hospital_hours` (
    `hospital_id` INTEGER NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `day` INTEGER NOT NULL,
    `open_time` VARCHAR(4) NULL,
    `close_time` VARCHAR(4) NULL,
    `break_start` VARCHAR(4) NULL,
    `break_end` VARCHAR(4) NULL,
    `reception_end` VARCHAR(4) NULL,

    INDEX `idx_hc_hours_open`(`day`, `open_time`, `close_time`),
    PRIMARY KEY (`hospital_id`, `kind`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healthcare_hospital_bed` (
    `hospital_id` INTEGER NOT NULL,
    `total` INTEGER NULL,
    `standard` INTEGER NULL,
    `higher` INTEGER NULL,
    `icu` INTEGER NULL,
    `emergency` INTEGER NULL,
    `operating_room` INTEGER NULL,
    `delivery` INTEGER NULL,
    `neonatal` INTEGER NULL,
    `isolation` INTEGER NULL,
    `psy_open` INTEGER NULL,
    `psy_closed` INTEGER NULL,

    PRIMARY KEY (`hospital_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healthcare_hospital_staff` (
    `hospital_id` INTEGER NOT NULL,
    `doctor_total` INTEGER NULL,
    `specialist` INTEGER NULL,
    `resident` INTEGER NULL,
    `intern` INTEGER NULL,
    `general_doctor` INTEGER NULL,
    `dentist` INTEGER NULL,
    `oriental` INTEGER NULL,
    `midwife` INTEGER NULL,

    PRIMARY KEY (`hospital_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healthcare_hospital_subject` (
    `hospital_id` INTEGER NOT NULL,
    `subject_cd` VARCHAR(30) NOT NULL,
    `declared` BOOLEAN NOT NULL DEFAULT false,
    `doctor_cnt` INTEGER NULL,
    `specialist_cnt` INTEGER NULL,

    INDEX `idx_hc_subject_cd`(`subject_cd`),
    PRIMARY KEY (`hospital_id`, `subject_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healthcare_hospital_equipment` (
    `hospital_id` INTEGER NOT NULL,
    `equipment_cd` VARCHAR(30) NOT NULL,
    `cnt` INTEGER NULL,

    INDEX `idx_hc_equipment_cd`(`equipment_cd`),
    PRIMARY KEY (`hospital_id`, `equipment_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healthcare_hospital_capability` (
    `hospital_id` INTEGER NOT NULL,
    `tp` VARCHAR(20) NOT NULL,
    `cd` VARCHAR(30) NOT NULL,
    `nm` VARCHAR(200) NULL,

    INDEX `idx_hc_capability_cd`(`tp`, `cd`),
    PRIMARY KEY (`hospital_id`, `tp`, `cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `healthcare_hospital_correction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hospital_id` INTEGER NOT NULL,
    `table_name` VARCHAR(50) NOT NULL,
    `field` VARCHAR(50) NOT NULL,
    `key_json` JSON NULL,
    `value` TEXT NULL,
    `reason` TEXT NULL,
    `updated_by` VARCHAR(50) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hc_correction_hospital`(`hospital_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
