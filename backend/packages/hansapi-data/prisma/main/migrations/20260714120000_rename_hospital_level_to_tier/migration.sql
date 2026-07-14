-- healthcare_hospital.level → tier
--
-- region_code 에도 level(sido|sggu) 이 있어서, 같은 이름이 "병원 등급" 과 "지역 계층" 을
-- 동시에 가리키고 있었다. 병원 쪽은 등급이라 tier 로 부른다.
--
-- 값도 함께 바꾼다: '1'|'2'|'3' 은 그 자체로 아무 의미가 없어 프론트가
-- `['1','2','3'].includes(...)` 처럼 숫자를 알아야만 했다. TIER1~3 은 코드만 봐도 등급이 읽힌다.
-- (tier 는 종별에서 유도되는 파생값이라 배치 재빌드로도 채워지지만, 배포 직후 조회가
--  깨지지 않도록 여기서 미리 변환해 둔다.)

-- 1) 컬럼 rename (MySQL 8: 메타데이터만 바뀌는 즉시 작업)
ALTER TABLE `healthcare_hospital` RENAME COLUMN `level` TO `tier`;

-- 2) 인덱스 rename
ALTER TABLE `healthcare_hospital` RENAME INDEX `idx_hc_hospital_level` TO `idx_hc_hospital_tier`;

-- 3) 값 변환
UPDATE `healthcare_hospital` SET `tier` = 'TIER1'   WHERE `tier` = '1';
UPDATE `healthcare_hospital` SET `tier` = 'TIER2'   WHERE `tier` = '2';
UPDATE `healthcare_hospital` SET `tier` = 'TIER3'   WHERE `tier` = '3';
UPDATE `healthcare_hospital` SET `tier` = 'NURSING' WHERE `tier` = 'nursing';
UPDATE `healthcare_hospital` SET `tier` = 'MENTAL'  WHERE `tier` = 'mental';
