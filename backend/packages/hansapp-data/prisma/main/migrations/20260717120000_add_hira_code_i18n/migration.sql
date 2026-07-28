-- hira_code 이름의 표시용 번역.
--
-- **시드가 채우는 tp(asm*)만 값이 있다.** sync 가 채우는 6종(codeInfoService)은 원본이
-- 한국어만 줘서 NULL 이고, 읽는 쪽이 한국어로 폴백한다(pickName). 원본 미러에 없는 번역을
-- 지어내지 않는다는 뜻이라 NULL 이 맞는 상태다.
--
-- 병원평가는 화면(medifinder 병원상세)에 그대로 나가는데 항목명이 한국어뿐이면
-- 영어로 봐도 "급성기뇌졸중" 이 뜬다. 번역을 어디 둘지가 문제인데, 프론트 로케일 파일로
-- 빼면 같은 코드의 이름이 DB(한국어)와 프론트(영·일·중)로 쪼개진다. 코드는 한 군데 모은다.
ALTER TABLE `hira_code`
  ADD COLUMN `cd_nm_en` VARCHAR(200) NULL COMMENT '코드명 영어',
  ADD COLUMN `cd_nm_ja` VARCHAR(200) NULL COMMENT '코드명 일본어',
  ADD COLUMN `cd_nm_zh` VARCHAR(200) NULL COMMENT '코드명 중국어(간체)',
  ADD COLUMN `tp_nm_en` VARCHAR(50) NULL COMMENT '코드 종류명 영어',
  ADD COLUMN `tp_nm_ja` VARCHAR(50) NULL COMMENT '코드 종류명 일본어',
  ADD COLUMN `tp_nm_zh` VARCHAR(50) NULL COMMENT '코드 종류명 중국어(간체)';
