-- AlterTable
--
-- "로그인 상태 유지" 선택을 세션에 적어 둔다.
--
-- 갱신(rotate) 때 쿠키를 다시 심어야 하는데, 그 시점의 요청만 보고는 원래 선택을 알 수 없다 —
-- 브라우저는 쿠키가 영속이었는지 알려 주지 않는다. 그래서 세션이 기억한다.
--
-- 기본값 TRUE 는 기존 행 때문이다. 지금까지 발급된 세션은 모두 영속 쿠키였다.
ALTER TABLE `user_token_session`
    ADD COLUMN `persistent` BOOLEAN NOT NULL DEFAULT TRUE;
