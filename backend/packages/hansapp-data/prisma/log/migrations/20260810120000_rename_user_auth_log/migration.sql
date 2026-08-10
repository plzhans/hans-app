-- user_action_log → user_auth_log.
--
-- **이 표는 처음부터 인증 로그였다** — 파일(auth.prisma)도 주석("인증 이벤트 로그")도 그렇게
-- 말하는데 이름만 "액션" 이었다. "액션" 은 아무것도 배제하지 않는 말이라, 좋아요·조회 같은
-- 서비스 행위를 여기 넣어도 되는지를 이름이 못 막는다. 행위 로그를 별도 표로 만들기 전에
-- 이름부터 갈라 둔다 — 두 표가 나란히 선 뒤에 바꾸면 훨씬 비싸다.
--
-- RENAME TABLE 은 메타데이터만 바꾸는 즉시 작업이다(데이터 복사 없음). 인덱스도 따라온다.
RENAME TABLE `user_action_log` TO `user_auth_log`;

-- 인덱스 이름은 표를 바꿔도 옛 이름 그대로 남는다. Prisma 가 기대하는 이름과 어긋나면
-- 다음 마이그레이션 생성 때 드리프트로 잡히므로 여기서 같이 맞춘다(둘 다 in-place).
ALTER TABLE `user_auth_log`
  RENAME INDEX `user_action_log_user_id_created_at_idx` TO `user_auth_log_user_id_created_at_idx`,
  RENAME INDEX `user_action_log_created_at_idx` TO `user_auth_log_created_at_idx`;
