-- 관리자 로그인 세션의 키를 (관리자, 세션) 복합키로 바꾸고, 세션 식별자를 숫자로 줄인다.
-- 회원 세션에 먼저 한 것과 같은 변경이다(20260813010000_session_id_int).
--
-- 그전에는 session_id 하나가 PK 라 전역에서 유일해야 했고, 그래서 24자 난수 문자열이었다.
-- 지금은 refresh 토큰이 관리자번호를 함께 싣고 조회도 캐시도 (관리자, 세션) 쌍으로 묶여서,
-- 식별자가 계정 안에서만 유일하면 된다 — 그 숫자만으로는 아무것도 가리키지 못한다.
--
-- **기존 행을 지운다.** 값의 형식이 달라 옮길 방법이 없고, refresh 토큰 형식도 함께
-- 바뀌어(관리자번호를 싣는다) 발급돼 있는 것은 전부 무효다. 모든 관리자가 다시 로그인한다.
DELETE FROM `admin_token_session`;

ALTER TABLE `admin_token_session` DROP PRIMARY KEY;
ALTER TABLE `admin_token_session` MODIFY `session_id` INT NOT NULL;
ALTER TABLE `admin_token_session` ADD PRIMARY KEY (`admin_id`, `session_id`);

-- 복합키의 앞자리가 admin_id 라 이 인덱스는 그 접두와 겹친다.
DROP INDEX `admin_token_session_admin_id_idx` ON `admin_token_session`;
