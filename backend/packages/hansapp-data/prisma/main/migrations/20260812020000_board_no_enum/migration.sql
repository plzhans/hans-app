-- DB enum 을 걷어낸다.
--
-- 값 하나 늘 때마다 ALTER TABLE 이 따라오고 배포 순서까지 맞춰야 한다 — 코드는 새 값을
-- 아는데 DB 는 모르는 구간이 생긴다. 허용 값은 코드(@hansapp/common 의 BOARD_* 상수)가 정한다.
--
-- **표의 크기에 따라 담는 모양을 다르게 한다.**
--  - board(게시판)  몇 행뿐이라 VARCHAR 그대로. DB 를 열어 봤을 때 바로 읽힌다.
--  - board_post·board_comment  계속 쌓이는 표라 TINYINT 코드로 담는다. 문자열이면 행마다
--    그 길이를 물고 가고 인덱스도 그만큼 커진다. 이름으로 바꾸는 것은 응답을 만드는 자리가 한다.
--
-- 코드 값(코드 상수와 같아야 한다):
--   author_type   1=USER 2=ADMIN
--   post.status   1=DRAFT 2=PUBLISHED 3=HIDDEN
--   comment.status 1=VISIBLE 2=HIDDEN

-- 게시판: enum → varchar. 값이 그대로라 옮길 것이 없다.
ALTER TABLE `board`
  MODIFY COLUMN `write_role` VARCHAR(20) NOT NULL DEFAULT 'ADMIN',
  MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 글: enum → tinyint. 값을 옮기려면 한 번 넓힌 뒤 숫자로 바꾼다
-- (enum 컬럼을 바로 tinyint 로 바꾸면 MySQL 이 enum 의 **순번**을 넣어 버린다).
ALTER TABLE `board_post`
  MODIFY COLUMN `author_type` VARCHAR(20) NOT NULL,
  MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED';

UPDATE `board_post`
   SET `author_type` = CASE `author_type` WHEN 'USER' THEN '1' ELSE '2' END,
       `status` = CASE `status`
                    WHEN 'DRAFT' THEN '1'
                    WHEN 'PUBLISHED' THEN '2'
                    ELSE '3'
                  END;

ALTER TABLE `board_post`
  MODIFY COLUMN `author_type` TINYINT NOT NULL,
  MODIFY COLUMN `status` TINYINT NOT NULL DEFAULT 2;

-- 댓글: 같은 방식.
ALTER TABLE `board_comment`
  MODIFY COLUMN `author_type` VARCHAR(20) NOT NULL,
  MODIFY COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'VISIBLE';

UPDATE `board_comment`
   SET `author_type` = CASE `author_type` WHEN 'USER' THEN '1' ELSE '2' END,
       `status` = CASE `status` WHEN 'VISIBLE' THEN '1' ELSE '2' END;

ALTER TABLE `board_comment`
  MODIFY COLUMN `author_type` TINYINT NOT NULL,
  MODIFY COLUMN `status` TINYINT NOT NULL DEFAULT 1;
