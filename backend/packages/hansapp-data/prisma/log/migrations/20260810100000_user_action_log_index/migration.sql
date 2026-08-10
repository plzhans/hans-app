-- 회원별 활동 기록 조회(관리 콘솔)를 위한 인덱스 교체.
--
-- `WHERE user_id=? [AND created_at BETWEEN ?] ORDER BY created_at DESC` 가 이 표의 유일한
-- 회원 단위 조회다. (user_id, action) 으로는 정렬이 filesort 로 떨어지고, 기간 조건도 못 탄다.
--
-- 기존 (user_id, action) 은 **읽는 코드가 없다** — 적재만 하던 표라 쓰인 적이 없는 인덱스다.
-- 쓰기가 잦은 표에서 안 쓰는 인덱스는 매 INSERT 마다 값만 치른다. 새 인덱스로 갈아 끼운다.
CREATE INDEX `user_action_log_user_id_created_at_idx` ON `user_action_log`(`user_id`, `created_at`);
DROP INDEX `user_action_log_user_id_action_idx` ON `user_action_log`;
