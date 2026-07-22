-- CreateTable
CREATE TABLE `user_action_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` ENUM('LOGIN', 'LOGOUT', 'SIGNUP', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'EMAIL_VERIFY', 'OAUTH_LINK', 'OAUTH_UNLINK', 'WITHDRAW') NOT NULL,
    `result` ENUM('SUCCESS', 'FAIL') NOT NULL,
    `provider` ENUM('EMAIL', 'GOOGLE', 'NAVER', 'KAKAO', 'LINE') NULL,
    `fail_reason` VARCHAR(100) NULL,
    `session_id` VARCHAR(64) NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `detail` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_action_log_user_id_action_idx`(`user_id`, `action`),
    INDEX `user_action_log_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

