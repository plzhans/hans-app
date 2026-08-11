-- 관리자 비밀번호 재설정 티켓(로그인 화면의 "비밀번호 찾기").
--
-- 토큰 원문은 담지 않는다 — 메일로 나간 값의 SHA-256 만 둔다. 이 표가 통째로 새도
-- 남의 계정을 가져갈 수 없어야 한다(세션 표가 secret 을 다루는 방식과 같다).
--
-- token_hash 가 unique 인 것은 대조가 이 열 하나로 끝나기 때문이다. 계정으로 찾을 일은
-- 새 요청이 왔을 때 옛 티켓을 지우는 것뿐이라 admin_id 에는 평범한 인덱스만 둔다.

-- CreateTable
CREATE TABLE `admin_password_reset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_password_reset_token_hash_key`(`token_hash`),
    INDEX `admin_password_reset_admin_id_idx`(`admin_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_password_reset`
  ADD CONSTRAINT `admin_password_reset_admin_id_fkey`
  FOREIGN KEY (`admin_id`) REFERENCES `admin_user`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
