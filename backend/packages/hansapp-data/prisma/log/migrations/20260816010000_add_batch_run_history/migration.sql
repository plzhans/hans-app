-- 배치 실행 이력.
--
-- 마스터(batch_job, sync_state)는 메인 DB 에 있고 마지막 상태만 덮어쓴다. 여기는 append 만
-- 하며 "언제언제 돌았나" 에 답한다. DB 가 갈려 있어 relation 은 없다 — 키는 값으로만 들고
-- 필요하면 raw SQL 로 조인한다(같은 MySQL 서버라 가능하다).
--
-- **행은 시작할 때 만들고 끝날 때 고친다.** 끝날 때 한 번만 넣으면 SIGKILL·OOM 으로 죽은
-- 실행이 통째로 사라진다 — 무엇을 하다 죽었는지가 가장 알고 싶은 경우인데도. 그렇게 죽은
-- 행은 status=RUNNING(2) 인 채로 남고, 그 자체가 신호가 된다.
--
-- **DB enum 을 쓰지 않는다.** 값 하나 늘 때마다 ALTER TABLE 이 따라오고, 코드는 새 값을
-- 아는데 DB 는 모르는 구간이 배포 사이에 생긴다. 계속 쌓이는 표라 코드는 숫자(TINYINT)로
-- 담는다 — 허용 값은 @hansapp/common 의 batch-codes.ts 가 정한다.
--   source  1=CRON 2=ONCE 3=CLI 4=ADMIN
--   status  1=IDLE 2=RUNNING 3=DONE 4=PARTIAL 5=FAILED 6=SKIPPED

-- CreateTable
CREATE TABLE `batch_job_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `job` VARCHAR(30) NOT NULL,
    `source` TINYINT NOT NULL,
    `status` TINYINT NOT NULL,
    `scheduled_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `elapsed_ms` INTEGER NULL,
    `calls` INTEGER NOT NULL DEFAULT 0,
    `processed` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,
    `summary` JSON NULL,

    INDEX `batch_job_history_job_started_at_idx`(`job`, `started_at`),
    INDEX `batch_job_history_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
--
-- 생략(status=6)도 남긴다. 이 표를 만든 이유의 절반이 그것이다.
CREATE TABLE `sync_state_history` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `job` VARCHAR(50) NOT NULL,
    `batch_job_history_id` BIGINT NULL,
    `provider` VARCHAR(10) NOT NULL,
    `stage` INTEGER NOT NULL,
    `detail` VARCHAR(30) NULL,
    `source` TINYINT NOT NULL,
    `status` TINYINT NOT NULL,
    `skip_reason` VARCHAR(100) NULL,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `elapsed_ms` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL DEFAULT 0,
    `processed` INTEGER NOT NULL DEFAULT 0,
    `calls` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,

    INDEX `sync_state_history_provider_stage_started_at_idx`(`provider`, `stage`, `started_at`),
    INDEX `sync_state_history_started_at_idx`(`started_at`),
    INDEX `sync_state_history_batch_job_history_id_idx`(`batch_job_history_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
