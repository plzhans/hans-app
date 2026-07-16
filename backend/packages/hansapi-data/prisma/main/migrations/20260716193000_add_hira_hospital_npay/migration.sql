-- HIRA 비급여 진료비(기관별 실제 청구금액).
-- 출처: nonPaymentDamtInfoService/getNonPaymentItemHospDtlList (목록형, 260콜 전수 259,353건)
--
-- 병원급 이상만 있다. 의원(clCd=31)은 이 API 에 통째로 없다.
-- 병원 목록의 부분집합이라 테이블을 나눈다. hira_hospital_asm 과 같은 이유다.
--
-- PK 에 sno(심평원이 매긴 순번)가 들어간다. 연속이 아니고 재부여될 수도 있는 값이지만,
-- 한 기관 안에서 행을 구분할 다른 수단이 없다(npayCd 는 중복된다).
-- sync 가 전량을 새로 받고 이번 라운드에 안 닿은 행을 synced_at 으로 지우므로 어긋나지 않는다.
CREATE TABLE `hira_hospital_npay` (
    `ykiho` VARCHAR(200) NOT NULL,
    `sno` INTEGER NOT NULL,
    `data` JSON NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ykiho`, `sno`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 종별코드. 원본은 '01'(상급종합)만 문자열이고 나머지는 숫자로 온다.
-- JSON_UNQUOTE(JSON_EXTRACT(...)) 가 둘 다 문자열로 정규화한다. hira_hospital_asm.cl_cd 와 같은 방식.
ALTER TABLE `hira_hospital_npay`
  ADD COLUMN `cl_cd` VARCHAR(5)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.clCd'))) VIRTUAL;

-- 비급여 항목코드. 항목별 가격 비교의 축이라 뽑아둔다. 원본이 항상 문자열('ABZ010001')이지만
-- cl_cd 와 같은 방식으로 통일한다.
ALTER TABLE `hira_hospital_npay`
  ADD COLUMN `npay_cd` VARCHAR(20)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.npayCd'))) VIRTUAL;

CREATE INDEX `idx_hira_hospital_npay_cl_cd` ON `hira_hospital_npay` (`cl_cd`);
CREATE INDEX `idx_hira_hospital_npay_npay_cd` ON `hira_hospital_npay` (`npay_cd`);
CREATE INDEX `idx_hira_hospital_npay_synced_at` ON `hira_hospital_npay` (`synced_at`);
