-- CreateTable
--
-- 가입 동의의 기록. **동의를 받았다는 입증 책임이 처리자에게 있다** — 화면의 체크박스만으로는
-- 나중에 아무것도 보여줄 수 없다.
--
-- version 은 동의한 문서의 판(시행일)이다. 약관을 개정할 때 **현재 판보다 낮은 사람에게만**
-- 재동의를 물으려면 이 값이 있어야 한다. AGE_14 는 문서가 없어 '-' 를 넣는다.
CREATE TABLE `user_consent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` ENUM('TERMS', 'PRIVACY', 'AGE_14') NOT NULL,
    `version` VARCHAR(20) NOT NULL,
    `agreed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,

    INDEX `user_consent_user_id_idx`(`user_id`),
    INDEX `user_consent_user_id_type_idx`(`user_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_consent` ADD CONSTRAINT `user_consent_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
