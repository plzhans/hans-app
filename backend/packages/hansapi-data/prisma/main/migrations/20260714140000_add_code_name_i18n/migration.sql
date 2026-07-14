-- 코드 이름 다국어 (en/ja)
--
-- 이름을 **코드 테이블에만** 둔다. 프론트 로케일 파일에 또 두면 시드에 코드를 추가하고
-- 프론트를 안 고치는 순간 갈라진다 — 코드 테이블을 만든 이유가 그 중복을 막는 것이다.
--
-- NULL 을 허용한다. **비어 있으면 nm(한국어)으로 폴백**하므로 번역을 점진적으로 채울 수 있고,
-- 새 코드가 번역 없이 배포돼도 화면이 깨지지 않는다(한국어가 나온다).

ALTER TABLE `healthcare_code`
  ADD COLUMN `nm_en` VARCHAR(100) NULL AFTER `nm`,
  ADD COLUMN `nm_ja` VARCHAR(100) NULL AFTER `nm_en`;

ALTER TABLE `region_code`
  ADD COLUMN `nm_en` VARCHAR(50) NULL AFTER `nm`,
  ADD COLUMN `nm_ja` VARCHAR(50) NULL AFTER `nm_en`;
