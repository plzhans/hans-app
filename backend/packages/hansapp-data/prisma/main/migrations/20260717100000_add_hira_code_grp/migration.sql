-- 병원평가 항목(tp='asm')의 상위 그룹. 심평원 홈페이지가 9개 그룹으로 묶어 보여주는데
-- API 는 그 정보를 안 준다. 그룹 자체도 tp='asmgrp' 행으로 이 테이블에 담고, asm 행이 여기를 가리킨다.
-- 나머지 tp 는 그룹이 없어 NULL 이다.
ALTER TABLE `hira_code`
  ADD COLUMN `grp` VARCHAR(20) NULL COMMENT '상위 그룹의 cd (asm 전용, tp=asmgrp 를 가리킨다)';

-- 그룹으로 항목을 뽑는 조회를 위해.
CREATE INDEX `idx_hira_code_grp` ON `hira_code` (`tp`, `grp`);
