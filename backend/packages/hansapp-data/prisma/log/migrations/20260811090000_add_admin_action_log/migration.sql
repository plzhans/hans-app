-- 관리자 행위 로그.
--
-- 회원 로그(user_auth_log)와 표를 나눈 이유는 번호 공간이 달라서다 — 그쪽 user_id 는
-- 메인 DB 의 user.id 이고, 거기에 admin_user.id 를 섞으면 둘을 구별할 수 없다.
--
-- 로그인만이 아니라 관리 조치(계정 생성·수정·삭제·비밀번호 초기화)까지 같은 표에 담는다.
-- 관리자는 몇 명뿐이라 건수가 적고, "누가 무엇을 했나" 라는 조회 방향이 같다.

-- CreateTable
CREATE TABLE `admin_action_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NULL,
    `email` VARCHAR(320) NULL,
    `action` ENUM('LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_CREATE', 'ADMIN_UPDATE', 'ADMIN_DELETE', 'ADMIN_PASSWORD_RESET') NOT NULL,
    `result` ENUM('SUCCESS', 'FAIL') NOT NULL,
    `target_admin_id` INTEGER NULL,
    `fail_reason` VARCHAR(100) NULL,
    `session_id` VARCHAR(64) NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `detail` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_action_log_admin_id_created_at_idx`(`admin_id`, `created_at`),
    INDEX `admin_action_log_target_admin_id_created_at_idx`(`target_admin_id`, `created_at`),
    INDEX `admin_action_log_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
