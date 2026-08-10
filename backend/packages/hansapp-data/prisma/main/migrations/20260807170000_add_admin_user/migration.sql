-- CreateTable
-- 관리자 계정. 회원(user)과 테이블부터 갈라 둔다 — 공개 로그인으로 얻은 자격이
-- admin 에 닿을 경로를 구조에서 없앤다.
CREATE TABLE `admin_user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(320) NOT NULL,
    -- 소셜 연동이 없으므로 NOT NULL 이다(user.password 는 소셜 전용 계정 때문에 NULL 허용).
    `password` VARCHAR(60) NOT NULL,
    `name` VARCHAR(100) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
-- 관리자 refresh 세션. user_token_session 과 달리 persistent 컬럼이 없다 —
-- 관리자에게는 "로그인 상태 유지" 를 두지 않아 쿠키가 항상 세션 쿠키다.
CREATE TABLE `admin_token_session` (
    `session_id` VARCHAR(64) NOT NULL,
    `admin_id` INTEGER NOT NULL,
    `secret_hash` CHAR(64) NOT NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip` VARCHAR(45) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `admin_token_session_admin_id_idx`(`admin_id`),
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- 계정을 지우면 세션도 함께 사라진다.
ALTER TABLE `admin_token_session` ADD CONSTRAINT `admin_token_session_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
