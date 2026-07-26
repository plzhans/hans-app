-- CreateTable
CREATE TABLE `email_verification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email_hash` CHAR(64) NOT NULL,
    `purpose` ENUM('SIGNUP', 'PASSWORD_RESET') NOT NULL,
    `code_hash` CHAR(64) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_verification_email_hash_purpose_idx`(`email_hash`, `purpose`),
    INDEX `email_verification_email_hash_created_at_idx`(`email_hash`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
