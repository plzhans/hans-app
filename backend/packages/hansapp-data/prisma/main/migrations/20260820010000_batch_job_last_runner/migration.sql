-- 마스터에 "마지막으로 돌린 곳" 을 남긴다.
--
-- 회차별 이력은 로그 DB(batch_job_history)에 있지만, 콘솔 카드는 메인 DB 만 읽는다
-- (두 DB 는 별도 client 라 조인이 안 된다). 카드에서 "이 잡이 어디서 도는가" 를 바로
-- 보려면 마스터에도 최근 값이 있어야 한다.

ALTER TABLE `batch_job`
    ADD COLUMN `last_hostname` VARCHAR(64) NULL,
    ADD COLUMN `last_version` VARCHAR(50) NULL;
