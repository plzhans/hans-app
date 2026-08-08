-- 앞 마이그레이션에서 만든 llm_endpoint 를 env_llm_key 로 바꿔 세운다.
-- **app_llm_key 와 구조를 맞추려는 것이다** — provider·name·secret 의 모양을 같게 두면
-- "앱이 등록한 키" 와 "서버가 쓰는 키" 를 나란히 읽을 수 있다.
--
-- 데이터를 옮기지 않고 다시 만든다. 등록 화면이 이번에 처음 나가서 아직 어느 환경에도
-- 실값이 없고, 컬럼 구성이 크게 갈려 옮길 것이 없다.
DROP TABLE IF EXISTS `llm_endpoint`;

-- CreateTable
CREATE TABLE `env_llm_key` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `provider` ENUM('OPENAI', 'ANTHROPIC', 'GOOGLE', 'LOCAL') NOT NULL,
    -- 호스팅 업체는 늘 빈 문자열. 아래 unique 와 짝이 되어 "하나만" 을 강제한다.
    `name` VARCHAR(50) NOT NULL DEFAULT '',
    -- 값을 어떻게 실어 보내는가. 접두사로 추측하지 않고 넣은 사람이 골라 적는다.
    `key_type` ENUM('API_KEY', 'AUTH_TOKEN') NOT NULL DEFAULT 'API_KEY',
    `secret_encrypted` VARCHAR(512) NULL,
    `secret_suffix` VARCHAR(8) NULL,
    `base_url` VARCHAR(200) NULL,
    `default_model` VARCHAR(100) NULL,
    `locked_models` VARCHAR(500) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- 호스팅 업체는 이름이 늘 같아(빈 문자열) 두 번째 행이 못 들어간다.
    -- LOCAL 은 이름이 다르면 얼마든지 들어간다. MySQL 에 조건부 유니크가 없어 이렇게 표현한다.
    UNIQUE INDEX `env_llm_key_provider_name_key`(`provider`, `name`),
    INDEX `env_llm_key_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
