-- 모델 목록의 차례를 사람이 정한다. **화면에 내려보내는 순서가 이 값이다** —
-- 등록한 순서가 곧 권하는 순서는 아니다.
ALTER TABLE `env_llm_model` ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0;

-- 지금 보이는 차례(id 순)를 그대로 굳힌다. 0 으로 두면 전부 같은 값이라
-- 화면이 뒤죽박죽으로 보이고, 그게 "정렬이 안 먹는다" 로 읽힌다.
UPDATE `env_llm_model` SET `sort_order` = `id`;

-- 목록 조회가 (key_id, sort_order) 로 돌므로 인덱스를 그쪽으로 옮긴다.
DROP INDEX `env_llm_model_key_id_enabled_idx` ON `env_llm_model`;
CREATE INDEX `env_llm_model_key_id_sort_order_idx` ON `env_llm_model`(`key_id`, `sort_order`);
