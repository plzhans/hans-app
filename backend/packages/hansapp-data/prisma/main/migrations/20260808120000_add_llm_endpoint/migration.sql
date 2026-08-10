-- CreateTable
-- 서버가 LLM 을 부를 때 쓰는 접속처. **설정(env_setting)이 아니라 관리 대상 목록이다** —
-- 같은 업체를 여럿 등록할 수 있어(운영용·개발용 키) 행이 늘고 준다.
--
-- provider 는 app_llm_key 와 같은 enum 을 쓴다. 앱이 제 키로 부르는 자리(app_llm_key)와
-- 우리 서버가 제 예산으로 부르는 자리(여기)를 가르되, "어느 업체냐" 는 같은 축이다.
--
-- api_key·auth_token 은 암호화해 넣는다(env_setting 의 secret 과 같은 꾸러미).
CREATE TABLE `llm_endpoint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `provider` ENUM('OPENAI', 'ANTHROPIC', 'GOOGLE', 'LOCAL') NOT NULL,
    `api_key` VARCHAR(1024) NULL,
    `auth_token` VARCHAR(1024) NULL,
    `base_url` VARCHAR(255) NULL,
    `default_model` VARCHAR(120) NULL,
    `locked_models` VARCHAR(500) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- 기본 접속처는 호출마다 찾는다. 행이 몇 개뿐이라도 인덱스가 있어야 계획이 안정적이다.
    INDEX `llm_endpoint_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
