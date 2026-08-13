-- 관리자 계정을 소프트 삭제로 바꾼다.
--
-- 계정 행 자체가 기록의 일부라 지우면 안 된다 — 조치 로그(admin_action_log)가
-- target_admin_id 로 가리키고 있고, 행이 사라지면 "그 번호가 누구였나" 를 아는 자리가
-- 로그 detail 의 이메일 한 줄만 남는다.
--
-- email 의 전역 unique 를 (email, deleted_seq) 로 바꾼다. MySQL 에는 부분 유니크 인덱스가
-- 없어서 `WHERE deleted_at IS NULL` 을 걸 수 없고, (email, deleted_at) 로 묶으면 NULL 끼리
-- 서로 다른 값으로 쳐서 살아 있는 계정이 여럿 생긴다. deleted_seq 는 살아 있으면 0,
-- 지우면 그 계정의 번호(id)라 — 살아 있는 계정은 주소마다 하나뿐이고, 지운 것은 몇 개든
-- 남는다(같은 주소로 다시 만들 수 있어야 한다).

ALTER TABLE `admin_user`
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `deleted_seq` INTEGER NOT NULL DEFAULT 0;

DROP INDEX `admin_user_email_key` ON `admin_user`;

CREATE UNIQUE INDEX `admin_user_email_deleted_seq_key` ON `admin_user`(`email`, `deleted_seq`);
