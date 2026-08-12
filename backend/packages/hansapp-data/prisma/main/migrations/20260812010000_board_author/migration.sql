-- 작성자를 한 벌(타입·번호·표시 이름)로 모은다.
--
-- 전에는 author_admin_id / author_user_id 두 열을 두고 채워진 쪽으로 갈랐다. 그러면 읽는
-- 쪽마다 분기가 생기고, 작성자를 늘릴 때(예: 시스템 자동 글) 열이 하나씩 는다. 타입 한 열로
-- 가르면 분기는 한 곳이고 늘어나는 것은 enum 값뿐이다.
--
-- **author_name 은 쓸 당시의 이름을 박아 둔 사본이다.** 목록에 이름을 뿌리려고 매번 회원
-- 표를 조인하지 않으려는 것이고, 계정이 지워져도 "누가 썼는지" 가 글에 남는다. 대신 나중에
-- 이름을 바꿔도 옛 글의 이름은 그대로다 — 그 시점의 표시가 남는 편이 낫다고 본 선택이다.
-- (닉네임 기능이 생기면 그때부터 닉네임을 넣는다. 지금은 이름을 넣는다.)

-- 1) 새 열을 먼저 붙인다(값은 다음 단계에서 채운다).
ALTER TABLE `board_post`
  ADD COLUMN `author_type` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN `author_id` INTEGER NULL,
  ADD COLUMN `author_name` VARCHAR(100) NULL;

ALTER TABLE `board_comment`
  ADD COLUMN `author_type` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN `author_id` INTEGER NULL,
  ADD COLUMN `author_name` VARCHAR(100) NULL;

-- 2) 있던 값을 옮긴다.
UPDATE `board_post`
   SET `author_type` = IF(`author_admin_id` IS NOT NULL, 'ADMIN', 'USER'),
       `author_id`   = COALESCE(`author_admin_id`, `author_user_id`);

UPDATE `board_comment`
   SET `author_type` = IF(`author_admin_id` IS NOT NULL, 'ADMIN', 'USER'),
       `author_id`   = COALESCE(`author_admin_id`, `author_user_id`);

-- 3) 표시 이름을 계정 표에서 한 번 떠 온다. 이름이 비어 있는 계정도 있어 기본값을 둔다.
UPDATE `board_post` p
  LEFT JOIN `admin_user` a ON a.`id` = p.`author_id`
   SET p.`author_name` = COALESCE(a.`name`, '관리자')
 WHERE p.`author_type` = 'ADMIN';

UPDATE `board_post` p
  LEFT JOIN `user` u ON u.`id` = p.`author_id`
   SET p.`author_name` = COALESCE(u.`name`, '회원')
 WHERE p.`author_type` = 'USER';

UPDATE `board_comment` c
  LEFT JOIN `admin_user` a ON a.`id` = c.`author_id`
   SET c.`author_name` = COALESCE(a.`name`, '관리자')
 WHERE c.`author_type` = 'ADMIN';

UPDATE `board_comment` c
  LEFT JOIN `user` u ON u.`id` = c.`author_id`
   SET c.`author_name` = COALESCE(u.`name`, '회원')
 WHERE c.`author_type` = 'USER';

-- 4) 값이 다 찼으니 NOT NULL 로 조인다. 작성자 없는 글·댓글은 없다.
ALTER TABLE `board_post`
  MODIFY COLUMN `author_id` INTEGER NOT NULL,
  MODIFY COLUMN `author_name` VARCHAR(100) NOT NULL;

ALTER TABLE `board_comment`
  MODIFY COLUMN `author_id` INTEGER NOT NULL,
  MODIFY COLUMN `author_name` VARCHAR(100) NOT NULL;

-- 5) 옛 열을 뗀다.
ALTER TABLE `board_post`
  DROP COLUMN `author_admin_id`,
  DROP COLUMN `author_user_id`;

ALTER TABLE `board_comment`
  DROP COLUMN `author_admin_id`,
  DROP COLUMN `author_user_id`;
