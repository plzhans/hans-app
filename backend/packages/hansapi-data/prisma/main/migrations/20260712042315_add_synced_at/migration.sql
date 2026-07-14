-- AlterTable
ALTER TABLE `hira_hospital` ADD COLUMN `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

-- AlterTable
ALTER TABLE `nmc_hospital` ADD COLUMN `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0);

-- CreateIndex
CREATE INDEX `idx_hira_hospital_synced_at` ON `hira_hospital`(`synced_at`);

-- CreateIndex
CREATE INDEX `idx_hira_hospital_updated_at` ON `hira_hospital`(`updated_at`);

-- CreateIndex
CREATE INDEX `idx_nmc_hospital_synced_at` ON `nmc_hospital`(`synced_at`);

-- CreateIndex
CREATE INDEX `idx_nmc_hospital_updated_at` ON `nmc_hospital`(`updated_at`);
