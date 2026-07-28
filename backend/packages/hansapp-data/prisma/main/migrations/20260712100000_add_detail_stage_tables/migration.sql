-- 2단계(개별 상세 조회) 준비.
--
-- 등급 타겟팅 컬럼은 generated column 이다. Prisma 가 표현하지 못해 여기서 직접 만든다.
-- schema.prisma 에는 평범한 컬럼으로 적혀 있다(읽기 위해). 값을 직접 쓰면 DB 가 거부한다.

-- NMC: 등급(duty_div) + basic 저장 + 이어받기 커서
ALTER TABLE `nmc_hospital`
  ADD COLUMN `duty_div` VARCHAR(5)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.dutyDiv'))) VIRTUAL,
  ADD COLUMN `basic` JSON NULL,
  ADD COLUMN `basic_synced_at` DATETIME(0) NULL;

-- basic_synced_at IS NULL 인 병원이 작업 큐다. 등급 순서로 골라내므로 복합 인덱스로 건다.
CREATE INDEX `idx_nmc_hospital_basic_queue` ON `nmc_hospital` (`duty_div`, `basic_synced_at`);

-- HIRA: 등급(cl_cd)
ALTER TABLE `hira_hospital`
  ADD COLUMN `cl_cd` VARCHAR(5)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.clCd'))) VIRTUAL;

CREATE INDEX `idx_hira_hospital_cl_cd` ON `hira_hospital` (`cl_cd`);

-- HIRA 개별 상세. (병원, 오퍼레이션) 한 쌍이 한 행이다. 행이 없으면 아직 안 받은 것이다.
CREATE TABLE `hira_hospital_detail` (
    `ykiho` VARCHAR(200) NOT NULL,
    `op` VARCHAR(20) NOT NULL,
    `data` JSON NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hira_hospital_detail_op`(`op`, `synced_at`),
    PRIMARY KEY (`ykiho`, `op`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 검색 축은 정규화한다.
CREATE TABLE `hira_hospital_equipment` (
    `ykiho` VARCHAR(200) NOT NULL,
    `oft_cd` VARCHAR(20) NOT NULL,
    `oft_nm` VARCHAR(100) NULL,
    `oft_cnt` INTEGER NULL,
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hira_hospital_equipment_cd`(`oft_cd`),
    PRIMARY KEY (`ykiho`, `oft_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `hira_hospital_srch` (
    `ykiho` VARCHAR(200) NOT NULL,
    `tp` VARCHAR(20) NOT NULL,
    `srch_cd` VARCHAR(20) NOT NULL,
    `srch_nm` VARCHAR(200) NULL,
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_hira_hospital_srch_cd`(`tp`, `srch_cd`),
    PRIMARY KEY (`ykiho`, `tp`, `srch_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
