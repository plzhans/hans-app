-- AlterTable
-- 병원 규모. 종별에서 유도해 빌드 때 확정한다. 조회 시점에 종별을 IN 절로 나열하지 않기 위해서다.
ALTER TABLE `healthcare_hospital` ADD COLUMN `level` VARCHAR(10) NULL;

-- CreateIndex
CREATE INDEX `idx_hc_hospital_level` ON `healthcare_hospital`(`level`, `region_cd`);
