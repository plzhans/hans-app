-- 게시판·게시글·댓글의 지우기를 소프트 삭제로 바꾼다.
--
-- 그전에는 행을 정말로 지웠다. FK 가 CASCADE 라 게시판 하나를 지우면 글도 댓글도 함께
-- 사라지는데, 잘못 눌렀을 때 되돌릴 방법이 없다. 그래서 콘솔은 "글이 있으면 삭제 금지" 로
-- 막고 있었고, 결국 지울 수 있는 게시판이 없었다.
--
-- 이제 행은 남기고 deleted_at 만 세운다. 조회하는 자리가 전부 `deleted_at IS NULL` 을
-- 조건에 넣어야 한다 — 이 조건을 빠뜨리면 지운 글이 다시 보인다.

ALTER TABLE `board` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `board_post` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `board_comment` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- 목록 조회는 살아 있는 것만 본다. 기존 인덱스 앞에 deleted_at 을 세운 짝을 더해,
-- 지운 행이 쌓여도 목록 쿼리가 그것들을 훑지 않게 한다.
CREATE INDEX `board_post_deleted_at_board_id_status_idx`
  ON `board_post` (`deleted_at`, `board_id`, `status`);
CREATE INDEX `board_comment_deleted_at_post_id_status_idx`
  ON `board_comment` (`deleted_at`, `post_id`, `status`);
