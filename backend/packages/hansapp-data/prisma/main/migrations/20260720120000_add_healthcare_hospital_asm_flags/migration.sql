-- 적정성평가 1등급 파생 플래그. 빌드(healthcare-build)가 hira_hospital_asm 에서 계산해 채운다.
-- emergency_yn·baby_yn 과 같은 패턴 — 검색이 원본 미러를 안 보게 healthcare_hospital 로 끌어올린다.
--
-- 값은 빌드가 채우므로 여기선 기본 false 로만 연다. 별도 인덱스는 안 건다
-- (emergency_yn·baby_yn 도 없다 — tier 인덱스와 함께 걸리는 보조 조건이고, 첫 페이지 섹션은 size=5 다).
ALTER TABLE `healthcare_hospital`
  ADD COLUMN `asm_cancer_yn` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '적정성평가 암질환(대장·위·유방·폐암) 1등급',
  ADD COLUMN `asm_cardio_yn` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '적정성평가 심뇌혈관(급성기뇌졸중·관상동맥우회술) 1등급',
  ADD COLUMN `asm_nicu_yn` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '적정성평가 신생아중환자실 1등급';
