-- CreateTable
CREATE TABLE `app_llm_key` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `app_id` INTEGER NOT NULL,
    `provider` ENUM('OPENAI', 'ANTHROPIC', 'GOOGLE') NOT NULL,
    `secret_encrypted` VARCHAR(512) NOT NULL,
    `secret_suffix` VARCHAR(8) NOT NULL,
    `base_url` VARCHAR(200) NULL,
    `default_model` VARCHAR(100) NULL,
    `monthly_limit_micro_usd` INTEGER NULL,
    `daily_limit_micro_usd` INTEGER NULL,
    `fallback_to_service` BOOLEAN NOT NULL DEFAULT false,
    `verify_state` ENUM('UNVERIFIED', 'VALID', 'INVALID') NOT NULL DEFAULT 'UNVERIFIED',
    `verified_at` DATETIME(3) NULL,
    `verify_error` VARCHAR(200) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_llm_key_app_id_provider_key`(`app_id`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app_llm_key` ADD CONSTRAINT `app_llm_key_app_id_fkey` FOREIGN KEY (`app_id`) REFERENCES `app`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
