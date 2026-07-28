-- AlterTable
-- 대중교통(HIRA transport). 표시 전용이라 하위 테이블로 쪼개지 않고 JSON 한 컬럼에 둔다.
ALTER TABLE `healthcare_hospital` ADD COLUMN `transport` JSON NULL;
