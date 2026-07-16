-- healthcare_code: 관리용 nm 유지, 표시용 title/title_en/title_ja 도입.
-- 데이터 보존: title 은 nm 을 복사, nm_en/nm_ja 는 title_en/title_ja 로 rename.

-- 1) 표시용 한국어 이름. 일단 관리용 nm 을 복사한다.
ALTER TABLE `healthcare_code` ADD COLUMN `title` VARCHAR(100) NOT NULL DEFAULT '' AFTER `nm`;
UPDATE `healthcare_code` SET `title` = `nm`;
ALTER TABLE `healthcare_code` ALTER COLUMN `title` DROP DEFAULT;

-- 2) 영어·일본어는 표시용이었으므로 rename (drop+add 가 아니라 CHANGE 로 데이터 보존).
ALTER TABLE `healthcare_code` CHANGE COLUMN `nm_en` `title_en` VARCHAR(100) NULL;
ALTER TABLE `healthcare_code` CHANGE COLUMN `nm_ja` `title_ja` VARCHAR(100) NULL;
