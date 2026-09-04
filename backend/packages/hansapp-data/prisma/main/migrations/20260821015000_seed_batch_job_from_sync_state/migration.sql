-- FK 를 걸기 전에 batch_job 에 참조 대상 행을 채운다.
--
-- **바로 다음 마이그레이션(sync_state_provider_fk)이 이것 없이는 운영에서 실패한다.**
-- batch_job 은 20260816010000 이 빈 표로 만들고, 행을 넣는 것은 부팅 때 도는 코드
-- (BatchJobRepository.register)뿐이다. 그런데 마이그레이션은 새 코드가 뜨기 **전에**
-- 전부 돌아간다 — 그 순간 batch_job 은 비어 있고, sync_state 에는 provider 가 든 행이
-- 이미 쌓여 있다. MySQL 은 참조 대상이 없는 FK 를 거부한다(errno 1452).
--
-- develop 이 멀쩡했던 것은 배포가 잦아서다. 표를 만든 배포와 FK 를 건 배포 사이에 앱이
-- 여러 번 떠서 batch_job 이 채워져 있었다. 운영은 v0.16.0 에서 한 번에 열한 개를 돌리므로
-- 그 사이가 없다.
--
-- 넣는 값은 job 이름뿐이고 나머지는 자리만 채운다. description·category·cron_expression·
-- time_zone 은 부팅 때 코드가 덮어쓰는 거울이라(같은 register 의 mirror) 곧 제 값이 된다.
-- status 는 처음 보는 잡과 같은 IDLE 로 연다.
--
-- INSERT IGNORE 라 이미 있는 잡은 건드리지 않는다. sync_state 가 비어 있으면 아무것도
-- 넣지 않는다 — 어느 쪽이든 여러 번 돌려도 같은 결과다.

INSERT IGNORE INTO `batch_job`
    (`job`, `description`, `category`, `cron_expression`, `time_zone`, `status`)
SELECT DISTINCT `provider`, '', '', '', '', 'IDLE'
FROM `sync_state`;
