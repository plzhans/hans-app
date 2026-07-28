-- 적정성평가 우수 파생 플래그 3개를 걷어낸다.
--
-- 임의 묶음(cancer/cardio/nicu) 대신 상세 검색이 항목별(22개)로 걸게 바뀌면서,
-- 검색은 원본 미러(hira_hospital_asm)를 직접 조인한다. 평가는 HIRA 전용이고 사용자 편집
-- 대상도 아니라 healthcare_* 로 복제할 이유가 없다 — 상세 페이지가 미러를 읽던 것과 같은 예외다.
ALTER TABLE `healthcare_hospital`
  DROP COLUMN `asm_cancer_yn`,
  DROP COLUMN `asm_cardio_yn`,
  DROP COLUMN `asm_nicu_yn`;
