-- 로그인 세션의 키를 (회원, 세션) 복합키로 바꾸고, 세션 식별자를 숫자로 줄인다.
--
-- 그전에는 session_id 하나가 PK 라 전역에서 유일해야 했고, 그래서 24자 난수 문자열이었다.
-- 지금은 refresh 토큰이 회원번호를 함께 싣고 조회도 캐시도 (회원, 세션) 쌍으로 묶여서,
-- 식별자가 회원 안에서만 유일하면 된다 — 그 숫자만으로는 아무것도 가리키지 못한다.
--
-- **기존 행을 지운다.** 값의 형식이 달라 옮길 방법이 없고, refresh 토큰 형식도 이미
-- 바뀌어(회원번호를 싣는다) 발급돼 있는 것은 전부 무효다. 모든 회원이 다시 로그인한다.
DELETE FROM `user_token_session`;

ALTER TABLE `user_token_session` DROP PRIMARY KEY;
ALTER TABLE `user_token_session` MODIFY `session_id` INT NOT NULL;
ALTER TABLE `user_token_session` ADD PRIMARY KEY (`user_id`, `session_id`);

-- 복합키의 앞자리가 user_id 라 이 인덱스는 그 접두와 겹친다.
DROP INDEX `user_token_session_user_id_idx` ON `user_token_session`;
