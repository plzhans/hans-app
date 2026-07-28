-- AlterTable
ALTER TABLE `user` ADD COLUMN `tier` ENUM('BASIC', 'PRO', 'UNLIMITED') NOT NULL DEFAULT 'BASIC';

-- CreateTable
CREATE TABLE `app` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `app_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_api_key` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `key_prefix` VARCHAR(20) NOT NULL,
    `key_hash` CHAR(64) NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `app_api_key_app_id_idx`(`app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_client` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_id` INTEGER NOT NULL,
    `client_id` VARCHAR(40) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `origins` JSON NOT NULL,
    `redirect_uris` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_client_client_id_key`(`client_id`),
    INDEX `app_client_app_id_idx`(`app_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app` ADD CONSTRAINT `app_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_api_key` ADD CONSTRAINT `app_api_key_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_client` ADD CONSTRAINT `app_client_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

