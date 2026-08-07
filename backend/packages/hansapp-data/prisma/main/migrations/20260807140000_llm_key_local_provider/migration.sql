-- LOCAL(Ollama·vLLM·LM Studio) 지원. 호스팅 업체와 성격이 달라 셋이 함께 바뀐다.
--   1) provider 안에서의 신원 컬럼(name) — "OpenAI 는 하나, Ollama 는 여럿" 을 여기서 가른다
--   2) 자격증명 선택화 — 사내 Ollama 는 대개 인증이 없다
--   3) provider 에 LOCAL 추가
--
-- 앞 마이그레이션에서 만든 직후라 행이 없다. 데이터 이전을 하지 않는 이유가 그것이다.

-- AlterTable
ALTER TABLE `app_llm_key`
    ADD COLUMN `name` VARCHAR(50) NOT NULL DEFAULT '' AFTER `provider`,
    MODIFY `provider` ENUM('OPENAI', 'ANTHROPIC', 'GOOGLE', 'LOCAL') NOT NULL,
    MODIFY `secret_encrypted` VARCHAR(512) NULL,
    MODIFY `secret_suffix` VARCHAR(8) NULL;

-- CreateIndex
-- **새 인덱스를 먼저 만든다.** 옛 인덱스(app_id, provider)는 app_id 가 맨 앞이라 FK 를 받치고
-- 있어서, 대체할 인덱스가 없는 상태로 지우면 MySQL 이 1553(Cannot drop index needed in a
-- foreign key constraint)으로 거절한다. 새 인덱스도 app_id 가 맨 앞이라 그 몫을 이어받는다.
--
-- 호스팅 업체는 name 이 늘 '' 이라 두 번째 행이 못 들어가고,
-- LOCAL 은 name 이 다르면 얼마든지 들어간다. MySQL 에 조건부 유니크가 없어 이 방식을 쓴다.
CREATE UNIQUE INDEX `app_llm_key_app_id_provider_name_key` ON `app_llm_key`(`app_id`, `provider`, `name`);

-- DropIndex
DROP INDEX `app_llm_key_app_id_provider_key` ON `app_llm_key`;
