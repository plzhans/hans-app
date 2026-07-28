-- grp 컬럼을 되돌린다.
--
-- hira_code 는 이미 2단 계층이다: tp/tp_nm(상위) → cd/cd_nm(하위). nmc_code 의
-- cm_mid/cm_mnm → cm_sid/cm_snm 과 같은 모양이다.
--
-- 병원평가를 "병원평가항목 > 그룹 > 항목" 3단으로 보고 grp 를 붙였는데, 맨 위 "병원평가항목" 은
-- 모든 행에 똑같이 붙는 **상수라 계층이 아니다**. 실제 계층은 "그룹 > 항목" 2단이고
-- 그건 tp → cd 에 그대로 들어간다. 컬럼이 필요 없다.
--
--   tp='asm01'(급성질환) → cd='01'(급성기뇌졸중) · cd='06'(관상동맥우회술) · cd='18'(폐렴)
DROP INDEX `idx_hira_code_grp` ON `hira_code`;

ALTER TABLE `hira_code` DROP COLUMN `grp`;
