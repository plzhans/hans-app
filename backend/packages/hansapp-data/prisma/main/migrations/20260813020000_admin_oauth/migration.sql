-- 관리자 계정 ↔ 외부 소셜 연동(지금은 구글 하나).
--
-- 신원은 provider_id(구글 sub)다. 이메일은 바뀔 수 있어 대조에 쓰지 않고, 화면에서 어느
-- 계정을 붙였는지 알아보는 용도로만 둔다.
--
-- unique 가 둘인 이유가 서로 다르다 — (provider, provider_id)는 한 소셜 계정이 관리자 둘에
-- 붙는 것을 막고, (admin_id, provider)는 한 관리자에 같은 provider 가 여러 번 붙는 것을 막는다.
-- 그래서 admin_id 로 찾는 조회도 뒤쪽 unique 의 접두로 해결돼 별도 인덱스가 필요 없다.

-- CreateTable
CREATE TABLE `admin_oauth` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `admin_id` INTEGER NOT NULL,
    `provider` ENUM('GOOGLE', 'NAVER', 'KAKAO', 'LINE') NOT NULL,
    `provider_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(320) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_oauth_provider_provider_id_key`(`provider`, `provider_id`),
    UNIQUE INDEX `admin_oauth_admin_id_provider_key`(`admin_id`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `admin_oauth`
  ADD CONSTRAINT `admin_oauth_admin_id_fkey`
  FOREIGN KEY (`admin_id`) REFERENCES `admin_user`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
