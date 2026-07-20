-- 사용자 요청 작업 큐.
--
-- **메시지 브로커의 대체품이다.** 지금 MQ 가 없어서 테이블로 둔다. 넣는 쪽과 꺼내는 쪽이 다르다:
--   hansapi-server  사용자가 '갱신 요청' 을 누르면 여기 한 줄 넣는다. **그게 전부다.**
--   배치            꺼내서 처리한다. 배치 서버가 아직 없어서 지금은 hansapi-cli 가 1건씩 돌린다.
--
-- **이 구조의 요점은 서버가 외부를 호출하지 않는다는 것이다.** 크롤은 admin 계층(CLI/배치)에만
-- 있고 서버는 큐에 마킹만 한다. 그래서 "서버는 로컬 DB 만 읽고 외부 API 호출은 admin 의 몫"
-- (admin-application.module.ts) 이 그대로 성립한다 — 서버가 크롤 클라이언트를 들고 있지 않다.
--
-- MQ 가 생기면 이 테이블은 그대로 걷어내면 된다. 넣는 쪽·꺼내는 쪽 인터페이스가 이미 갈려 있다.
CREATE TABLE `job_queue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,

    -- 작업 종류. 지금은 npay-web 하나다 (심평원 홈페이지 비급여 크롤, clients/kr-or-hira).
    `tp` VARCHAR(30) NOT NULL,

    -- 작업 대상. tp=npay-web 이면 **암호화 요양기호**다(숫자 기관ID 가 아니다 — step1 이 그걸 만든다).
    `target` VARCHAR(200) NOT NULL,

    -- pending | running | done | failed
    --
    -- running 은 배치가 집어간 상태다. 프로세스가 죽으면 여기 남는데, 지금은 CLI 로 1건씩
    -- 돌리므로 사람이 보고 되돌리면 된다. 배치 서버가 붙으면 sync_state 처럼 스테일 판정이 필요하다.
    `status` VARCHAR(10) NOT NULL DEFAULT 'pending',

    -- 실패 사유. status=failed 일 때만 채운다. 크롤은 마크업이 바뀌면 터지므로(HiraWebError)
    -- 그 메시지가 여기 남아야 원인을 찾는다.
    `error` TEXT NULL,

    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    -- 배치가 처리를 끝낸 시각. 성공·실패 모두 찍는다.
    `processed_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`),

    -- **같은 대상은 한 줄이다.** 100 명이 같은 병원의 갱신을 눌러도 큐에는 하나만 쌓인다.
    -- 이미 처리된(done) 대상을 다시 요청하면 이 행의 status 를 pending 으로 되돌린다.
    UNIQUE KEY `uk_job_queue_tp_target` (`tp`, `target`),

    -- 배치가 pending 을 오래된 순으로 꺼낸다.
    KEY `idx_job_queue_status` (`status`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
