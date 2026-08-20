-- 배치 잡 마스터와 단계의 다음 실행 자격 시각.
--
-- 지금까지 "이 배치가 매일 돌았나" 에 답할 수 있는 표가 없었다. sync_state 는 단계마다 한 행을
-- 덮어쓰므로 마지막 상태만 알고, 무엇보다 **생략된 단계는 아무것도 남기지 않는다** — 목록 단계는
-- 신선도가 7일이라 주 6일이 생략인데, 그 6일은 배치가 정상적으로 돌고 전부 건너뛴 날과
-- 프로세스가 죽어 아예 안 돈 날이 DB 상 완전히 같아 보였다.
-- 인증 정리 잡(auth-cleanup)은 아예 어떤 표에도 흔적이 없었다.
--
-- batch_job 은 스케줄이 붙은 잡의 목록이자 현황이다. sync_state 와 같은 역할이고 단위만 다르다
-- (그쪽은 단계, 이쪽은 잡 회차). 이력은 로그 DB 의 batch_job_history / sync_state_history 가 쌓는다.
--
-- description·category·cron_expression·time_zone 은 **거울이다.** 정본은 코드와 config 이고,
-- 부팅 때 스케줄러가 실어 넣는다 — 여기를 고쳐도 주기는 안 바뀐다.

-- CreateTable
CREATE TABLE `batch_job` (
    `job` VARCHAR(30) NOT NULL,
    `description` VARCHAR(200) NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `cron_expression` VARCHAR(50) NOT NULL,
    `time_zone` VARCHAR(40) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `last_started_at` DATETIME(0) NULL,
    `last_finished_at` DATETIME(0) NULL,
    `last_success_at` DATETIME(0) NULL,
    `last_elapsed_ms` INTEGER NOT NULL DEFAULT 0,
    `last_calls` INTEGER NOT NULL DEFAULT 0,
    `last_processed` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `failure_streak` INTEGER NOT NULL DEFAULT 0,
    `next_run_at` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`job`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
--
-- 다음에 돌 자격이 생기는 시각 = last_success_at + 신선도.
--
-- **판정에 쓰는 값이 아니다.** 신선도는 코드 상수(STAGE_FRESHNESS_HOURS)가 정하고 판정도
-- 거기서 한다 — 이 열은 그 결과를 적어 두는 것이다. DB 만 열어 봤을 때 "nmc.1 은 다음
-- 화요일에나 돈다" 가 바로 보이라고 둔다. 기존 행은 NULL 로 남고, 다음 실행부터 채워진다.

ALTER TABLE `sync_state`
    ADD COLUMN `next_eligible_at` DATETIME(0) NULL;
