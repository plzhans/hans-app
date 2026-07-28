-- DropForeignKey
ALTER TABLE `app` DROP FOREIGN KEY `app_user_id_fkey`;

-- DropIndex
DROP INDEX `app_user_id_idx` ON `app`;

-- AlterTable
ALTER TABLE `app` DROP COLUMN `user_id`,
    ADD COLUMN `created_by` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `app_member` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `app_member_user_id_idx`(`user_id`),
    UNIQUE INDEX `app_member_app_id_user_id_key`(`app_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `app_created_by_idx` ON `app`(`created_by`);

-- AddForeignKey
ALTER TABLE `app_member` ADD CONSTRAINT `app_member_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `app_member` ADD CONSTRAINT `app_member_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

