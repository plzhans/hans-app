-- AlterTable
--
-- 세션에 "어느 앱을 통해 로그인했나" 를 남긴다.
--
-- 지금까지 이 정보는 인가코드(user_auth_code.client_id)에만 있었고, 코드를 토큰으로 교환하는
-- 순간 사라졌다. 그래서 갱신으로 다시 찍는 access token 에는 앱을 실을 수 없었고, 서버는
-- 요청 헤더(X-Client-Id)를 믿는 수밖에 없었다 — 토큰을 발급한 앱과 헤더의 앱이 다를 수 있어
-- 그 값으로 사용량을 세면 남의 몫으로 기록될 수 있다.
--
-- NULL 은 1st-party(우리 웹에서 직접 로그인)다. 이미 있는 세션은 전부 NULL 로 남고,
-- 다음 로그인부터 값이 채워진다.

ALTER TABLE `user_token_session`
    ADD COLUMN `app_id` INT NULL;
