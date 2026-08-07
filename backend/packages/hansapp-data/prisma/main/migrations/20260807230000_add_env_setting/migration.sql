-- CreateTable
-- 설정 파일 대신 화면에서 관리하는 서비스 설정.
-- 어떤 키가 존재하는지는 코드(설정 카탈로그)가 정하므로, 설정을 더할 때 마이그레이션이 없다.
--
-- 값은 **비밀값만** 암호화한다(카탈로그의 type=secret). 전부 잠그면 장애 때 SQL 로 확인할 수
-- 있는 값이 하나도 없다. 어떻게 저장했는지는 `encrypted` 가 행마다 기억한다 —
-- 카탈로그를 읽어 판단하면 분류를 바꾸는 순간 기존 행이 깨진다.
CREATE TABLE `env_setting` (
    `key` VARCHAR(120) NOT NULL,
    `value` VARCHAR(1024) NOT NULL,
    `encrypted` BOOLEAN NOT NULL DEFAULT false,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
