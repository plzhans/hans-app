-- CreateTable
CREATE TABLE `llm_usage` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `request_id` VARCHAR(64) NULL,
    `app_id` INTEGER NULL,
    `user_id` INTEGER NULL,
    `feature` VARCHAR(50) NOT NULL,
    `prompt_name` VARCHAR(50) NOT NULL,
    `prompt_hash` VARCHAR(32) NOT NULL,
    `question_hash` VARCHAR(64) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `input_tokens` INTEGER NOT NULL DEFAULT 0,
    `output_tokens` INTEGER NOT NULL DEFAULT 0,
    `cache_read_tokens` INTEGER NOT NULL DEFAULT 0,
    `cache_write_tokens` INTEGER NOT NULL DEFAULT 0,
    `cached` BOOLEAN NOT NULL DEFAULT false,
    `elapsed_ms` INTEGER NOT NULL,
    `upstream_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `llm_usage_created_at_app_id_idx`(`created_at`, `app_id`),
    INDEX `llm_usage_created_at_user_id_idx`(`created_at`, `user_id`),
    INDEX `llm_usage_request_id_idx`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
