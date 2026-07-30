-- CreateTable
--
-- Swagger(/docs, /openapi.json) 접근 허용 IP 목록.
-- production 은 문서를 열어두되 이 목록에 있는 IP 에서 온 요청만 통과시킨다.
--
-- 목록이 비어 있으면 아무도 문서를 못 본다(fail-closed). 배포 후 최소 한 건은 넣어야 한다:
--   INSERT INTO env_swagger_allowed_ip (ip_address, description)
--   VALUES ('203.0.113.10', '사무실 고정회선');
CREATE TABLE `env_swagger_allowed_ip` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ip_address` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX `env_swagger_allowed_ip_ip_address_key`(`ip_address`),
    INDEX `idx_env_swagger_ip_enabled`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
