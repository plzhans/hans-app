-- sync_state.provider 를 batch_job.job 을 참조하는 FK 로 바꾼다.
--
-- 지금까지 provider 는 코드가 'hira'|'nmc'|'mois' 를 손으로 박아 넣는 문자열이었다.
-- batch_job 이 이미 그 세 값을 포함하는 고정 목록이라, DB 가 직접 존재를 보장하게 한다 —
-- 오타·존재하지 않는 provider 는 이제 쓰는 시점에 제약 위반으로 막힌다.
--
-- ON DELETE RESTRICT: batch_job 은 코드가 정하는 고정 목록이라 지울 일이 사실상 없지만,
-- 혹시 지우려 하면 이 표에 남은 단계가 먼저 걸린다(말없이 고아 행을 남기는 것보다 낫다).
--
-- 기존 sync_state.provider 값은 전부 batch_job.job 에 이미 존재한다(hira/nmc/mois 3종,
-- 적용 전 실데이터로 확인) — 제약 추가가 기존 행을 깨지 않는다.

ALTER TABLE `sync_state`
    ADD CONSTRAINT `fk_sync_state_batch_job`
    FOREIGN KEY (`provider`) REFERENCES `batch_job`(`job`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
