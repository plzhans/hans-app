-- 좋아요 스위치를 더하고, 글의 댓글·좋아요 설정에 "게시판 따름"(null)을 연다.
--
-- **저장 시점에 자르지 않는다.** 지금까지는 글을 저장할 때 게시판 값으로 잘라 넣었는데,
-- 그러면 나중에 게시판에서 댓글을 켜도 그전에 쓴 글은 꺼진 채로 남는다 — 글을 하나하나
-- 고칠 수는 없다. 이제 글은 자기 뜻만 적고(null=따름 / true=허용 / false=불가),
-- 실제로 열리는지는 읽을 때 계산한다.

ALTER TABLE `board`
  ADD COLUMN `like_enabled` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `board_post`
  MODIFY COLUMN `comment_enabled` BOOLEAN NULL,
  ADD COLUMN `like_enabled` BOOLEAN NULL;

-- 있던 글은 전부 "게시판 따름" 으로 되돌린다. 지금 들어 있는 값은 사용자가 고른 것이 아니라
-- 저장 때 잘린 결과라, 그대로 두면 "명시적으로 그렇게 정했다" 는 뜻이 돼 버린다.
UPDATE `board_post` SET `comment_enabled` = NULL;
