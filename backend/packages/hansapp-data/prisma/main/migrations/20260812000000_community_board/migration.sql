-- 커뮤니티: 게시판·게시글·댓글.
--
-- **게시판이 규칙을 들고 있다.** 누가 쓸 수 있나(write_role)와 댓글을 받나(comment_enabled)가
-- 게시판마다 다르고, 글의 comment_enabled 는 그 아래에서만 의미가 있다 — 게시판이 댓글을
-- 닫으면 글 설정과 무관하게 댓글은 없다. 이 관계는 DB 로 표현할 수 없어 서비스가 지킨다.
--
-- 작성자를 author_admin_id / author_user_id 로 나눠 두고 FK 는 걸지 않는다. 관리자와 회원은
-- 계정 계층이 통째로 갈라져 있어 한 열로 합칠 수 없고, 회원을 지우는 일이 글을 끌고
-- 내려가서도 안 된다(글은 남기고 작성자만 비운다).

-- CreateTable
CREATE TABLE `board` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    -- name 은 기계가 쓰는 이름(주소·API), title 은 사람이 읽는 이름이다.
    `name` VARCHAR(50) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `description` VARCHAR(500) NULL,
    `write_role` ENUM('ADMIN', 'MEMBER') NOT NULL DEFAULT 'ADMIN',
    -- 기능 스위치는 전부 게시판이 들고 있다. 글·댓글의 같은 이름 설정은 여기서 켠
    -- 범위 안에서만 의미가 있다(상위가 꺼져 있으면 하위는 무시된다).
    `comment_enabled` BOOLEAN NOT NULL DEFAULT false,
    `secret_post_enabled` BOOLEAN NOT NULL DEFAULT false,
    `secret_comment_enabled` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'HIDDEN') NOT NULL DEFAULT 'ACTIVE',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `board_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `board_post` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `board_id` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `summary` VARCHAR(300) NULL,
    `author_admin_id` INTEGER NULL,
    `author_user_id` INTEGER NULL,
    `comment_enabled` BOOLEAN NOT NULL DEFAULT true,
    -- 비공개 글. 본문을 볼 수 있는 사람은 쓴 사람과 운영자뿐이다(목록에는 제목만 남는다).
    `secret` BOOLEAN NOT NULL DEFAULT false,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('DRAFT', 'PUBLISHED', 'HIDDEN') NOT NULL DEFAULT 'PUBLISHED',
    `published_at` DATETIME(3) NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    -- 목록 조회 한 벌: 게시판 안에서 공개된 글을 고정 먼저, 그다음 공개일 역순.
    INDEX `board_post_board_id_status_pinned_published_at_idx`(`board_id`, `status`, `pinned`, `published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `board_comment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `parent_id` INTEGER NULL,
    `content` TEXT NOT NULL,
    -- 비공개 댓글. 본문을 볼 수 있는 사람은 쓴 사람·글쓴이·운영자뿐이고, 나머지에게는
    -- 응답에서 본문을 빼고 보낸다(화면에서 가리는 것으로는 개발자도구에 다 보인다).
    `secret` BOOLEAN NOT NULL DEFAULT false,
    `author_admin_id` INTEGER NULL,
    `author_user_id` INTEGER NULL,
    `status` ENUM('VISIBLE', 'HIDDEN') NOT NULL DEFAULT 'VISIBLE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `board_comment_post_id_status_created_at_idx`(`post_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- 게시판을 지우면 글도 함께 지운다. 다만 콘솔은 글이 있는 게시판을 지우지 못하게 막는다 —
-- 이 CASCADE 는 "실수로 남는 고아 행" 을 막는 안전장치이지 삭제 수단이 아니다.
ALTER TABLE `board_post`
  ADD CONSTRAINT `board_post_board_id_fkey`
  FOREIGN KEY (`board_id`) REFERENCES `board`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `board_comment`
  ADD CONSTRAINT `board_comment_post_id_fkey`
  FOREIGN KEY (`post_id`) REFERENCES `board_post`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- 답글은 부모가 사라지면 같이 사라진다. 화면에서 "삭제된 댓글" 로 남기는 것은 status=HIDDEN
-- 이고, 행을 지우는 것은 그와 다른 결정이다.
ALTER TABLE `board_comment`
  ADD CONSTRAINT `board_comment_parent_id_fkey`
  FOREIGN KEY (`parent_id`) REFERENCES `board_comment`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
