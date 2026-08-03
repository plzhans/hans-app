-- AlterTable
--
-- 병원 이름에서 법인 표기를 뗀다. name 이 **원문에서 파생값으로 바뀐다.**
--
-- 원본(HIRA yadmNm · NMC dutyName)은 이름 하나만 주는데 그 안에 법인격이 섞여 있다.
--   "(의)일맥의료재단 강동더서울의원"
--   "학교법인 고려중앙학원 고려대학교의과대학부속병원(안암병원)"
-- 목록에서 이걸 그대로 쓰면 화면의 절반이 법인명이라 병원 이름이 잘려 보인다.
--
-- [왜 name 을 짧은 이름으로 쓰나]
-- name 을 원문으로 두고 short_name 을 새로 만들 수도 있었다. 그러면 name 을 읽는 모든
-- 자리(조회 SQL·서비스 매핑·DTO·ES 색인·프론트·i18n)를 전부 바꿔야 한다.
-- name 에 짧은 이름을 담으면 그 전부가 그대로 동작한다. 원문은 legal_name 이 받는다.
--
-- [왜 legal_name 이 NOT NULL 인가]
-- 법인 표기가 없는 98.7% 는 name 과 같은 값이 들어간다. 중복이지만 전체 1.8MB 다.
-- "다를 때만 채운다" 로 하면 name 을 정정한 직후부터 다음 빌드까지 원문이 어디에도
-- 없는 구간이 생긴다 — 하필 그 정정이 맞는지 확인하고 싶은 시점이다.
--
-- [이 마이그레이션이 채우는 것은 legal_name 뿐이다]
-- name·corp_name 은 분리 규칙(TS, splitHospitalName)이 필요해서 SQL 로 못 만든다.
-- 여기서는 legal_name 에 현재 name 을 그대로 복사해 원문을 확보만 한다.
-- 실제 분리는 배포 후 `hansapp-cli healthcare names` 또는 다음 빌드가 한다.
-- 그때까지 name 은 지금 값 그대로이므로 화면이 깨지지 않는다.

ALTER TABLE `healthcare_hospital`
    ADD COLUMN `legal_name` VARCHAR(200) NULL AFTER `name`,
    ADD COLUMN `corp_name`  VARCHAR(200) NULL AFTER `legal_name`;

-- 원문 확보. 아직 분리 전이라 name 이 곧 원문이다.
UPDATE `healthcare_hospital` SET `legal_name` = `name`;

-- 백필이 끝난 뒤에 NOT NULL 로 조인다. 처음부터 NOT NULL 로 만들면 기존 행 때문에
-- 빈 문자열 기본값이 필요한데, 그러면 "아직 안 채운 것" 과 "진짜 빈 값" 이 같아진다.
ALTER TABLE `healthcare_hospital`
    MODIFY COLUMN `legal_name` VARCHAR(200) NOT NULL;
