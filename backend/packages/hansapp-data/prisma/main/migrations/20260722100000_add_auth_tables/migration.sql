-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(320) NOT NULL,
    `email_verified` BOOLEAN NOT NULL DEFAULT false,
    `password` VARCHAR(60) NULL,
    `name` VARCHAR(100) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
    `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    `join_type` ENUM('EMAIL', 'GOOGLE', 'NAVER', 'KAKAO', 'LINE') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `withdrawn_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_oauth` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `provider` ENUM('GOOGLE', 'NAVER', 'KAKAO', 'LINE') NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(320) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_oauth_user_id_idx`(`user_id`),
    UNIQUE INDEX `user_oauth_provider_provider_id_key`(`provider`, `provider_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `purpose` ENUM('EMAIL_VERIFY', 'PASSWORD_RESET') NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_token_user_id_purpose_idx`(`user_id`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_token_session` (
    `session_id` VARCHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `secret_hash` CHAR(64) NOT NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip` VARCHAR(45) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_token_session_user_id_idx`(`user_id`),
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_auth_code` (
    `sid` VARCHAR(32) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `secret_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_auth_code_user_id_idx`(`user_id`),
    PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_withdrawal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `original_user_id` INTEGER NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `name` VARCHAR(100) NULL,
    `withdrawn_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `purge_at` DATETIME(3) NOT NULL,

    INDEX `user_withdrawal_email_idx`(`email`),
    INDEX `user_withdrawal_purge_at_idx`(`purge_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_oauth` ADD CONSTRAINT `user_oauth_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_token` ADD CONSTRAINT `user_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_token_session` ADD CONSTRAINT `user_token_session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_auth_code` ADD CONSTRAINT `user_auth_code_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

