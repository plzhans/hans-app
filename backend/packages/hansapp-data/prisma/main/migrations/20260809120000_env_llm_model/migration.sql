-- 모델을 키의 컬럼이 아니라 **행으로** 관리한다.
--
-- 쉼표 나열(allowed_models)로는 모델 하나를 잠깐 끄는 것도, 어느 것이 기본인지도 표현할 수
-- 없었다. 화면에서 모델을 더하고 끄고 지우려면 행이어야 한다.
--
-- 옮길 값이 있다 — default_model·allowed_models 에 든 것을 그대로 행으로 푼다.

-- CreateTable
CREATE TABLE `env_llm_model` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    -- 끄면 목록에는 남되 부를 수 없다. 지우는 것과 다르다.
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    -- 요청이 모델을 안 적었을 때 쓸 모델. 키마다 하나만 true 다(서비스가 보장한다).
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `env_llm_model_key_id_name_key`(`key_id`, `name`),
    INDEX `env_llm_model_key_id_enabled_idx`(`key_id`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- 키를 지우면 그 키로만 부를 수 있던 모델도 같이 사라진다.
ALTER TABLE `env_llm_model` ADD CONSTRAINT `env_llm_model_key_id_fkey`
    FOREIGN KEY (`key_id`) REFERENCES `env_llm_key`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 값 이관 ①: default_model 을 기본 모델 행으로.
INSERT INTO `env_llm_model` (`key_id`, `name`, `enabled`, `is_default`, `created_at`, `updated_at`)
SELECT `id`, TRIM(`default_model`), true, true, NOW(3), NOW(3)
  FROM `env_llm_key`
 WHERE `default_model` IS NOT NULL AND TRIM(`default_model`) <> '';

-- 기존 값 이관 ②: allowed_models(쉼표 나열)를 행으로 푼다.
--
-- **재귀 CTE 로 쪼갠다.** MySQL 에는 문자열 분해 함수가 없다. 원소 수가 몇 개뿐이라
-- 기본 재귀 깊이(1000)에 한참 못 미친다. INSERT IGNORE 라 ①에서 이미 넣은 기본 모델과
-- 겹쳐도 조용히 지나간다(유니크 인덱스가 받아 준다).
INSERT IGNORE INTO `env_llm_model` (`key_id`, `name`, `enabled`, `is_default`, `created_at`, `updated_at`)
WITH RECURSIVE split (`key_id`, `head`, `rest`) AS (
  SELECT `id`,
         TRIM(SUBSTRING_INDEX(`allowed_models`, ',', 1)),
         CASE WHEN LOCATE(',', `allowed_models`) > 0
              THEN SUBSTRING(`allowed_models`, LOCATE(',', `allowed_models`) + 1)
              ELSE '' END
    FROM `env_llm_key`
   WHERE `allowed_models` IS NOT NULL AND TRIM(`allowed_models`) <> ''
  UNION ALL
  SELECT `key_id`,
         TRIM(SUBSTRING_INDEX(`rest`, ',', 1)),
         CASE WHEN LOCATE(',', `rest`) > 0
              THEN SUBSTRING(`rest`, LOCATE(',', `rest`) + 1)
              ELSE '' END
    FROM split
   WHERE `rest` <> ''
)
SELECT `key_id`, `head`, true, false, NOW(3), NOW(3) FROM split WHERE `head` <> '';

-- 옮겼으니 컬럼을 걷어낸다.
ALTER TABLE `env_llm_key` DROP COLUMN `default_model`,
                          DROP COLUMN `allowed_models`;
