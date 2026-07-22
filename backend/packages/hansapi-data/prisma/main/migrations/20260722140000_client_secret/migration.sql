-- AlterTable
ALTER TABLE `app_client` ADD COLUMN `client_secret_hash` CHAR(64) NOT NULL,
    ADD COLUMN `last_used_at` DATETIME(3) NULL,
    ADD COLUMN `secret_created_at` DATETIME(3) NOT NULL,
    ADD COLUMN `secret_suffix` VARCHAR(8) NOT NULL;

