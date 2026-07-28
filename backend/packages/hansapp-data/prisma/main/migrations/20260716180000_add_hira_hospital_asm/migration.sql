-- HIRA 병원평가 등급. 출처: hospAsmInfoService1/getHospAsmInfo (목록형, 37콜 전수)
--
-- 병원 목록의 부분집합(36,599 / 79,739)이지만 원본이 별도 API 라 테이블을 나눈다.
-- nmc_baby_hospital 과 같은 이유다.
CREATE TABLE `hira_hospital_asm` (
    `ykiho` VARCHAR(200) NOT NULL,
    `data` JSON NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ykiho`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 종별코드. 원본은 '01'(상급종합)만 문자열이고 나머지는 숫자로 온다.
-- JSON_UNQUOTE(JSON_EXTRACT(...)) 가 둘 다 문자열로 정규화한다. hira_hospital.cl_cd 와 같은 방식.
ALTER TABLE `hira_hospital_asm`
  ADD COLUMN `cl_cd` VARCHAR(5)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.clCd'))) VIRTUAL;

CREATE INDEX `idx_hira_hospital_asm_cl_cd` ON `hira_hospital_asm` (`cl_cd`);
CREATE INDEX `idx_hira_hospital_asm_synced_at` ON `hira_hospital_asm` (`synced_at`);
