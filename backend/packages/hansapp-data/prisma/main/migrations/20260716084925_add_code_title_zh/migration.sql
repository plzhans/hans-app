-- healthcare_code: 표시용 중국어(간체) 이름 컬럼 추가. 기존 데이터 영향 없음(NULL 허용).
ALTER TABLE `healthcare_code` ADD COLUMN `title_zh` VARCHAR(100) NULL AFTER `title_ja`;
