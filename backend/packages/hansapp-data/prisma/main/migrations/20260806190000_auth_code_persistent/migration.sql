-- 인가코드에 "로그인 상태 유지" 선택을 싣는다.
--
-- 세션은 콜백이 아니라 교환(/oauth/token) 시점에 만들어지는데, 그 요청에는 사용자의 선택이
-- 없다. 코드가 콜백에서 교환까지 가는 유일한 운반 수단이라 여기 둔다.
--
-- 기본을 1 로 두는 건 배포 순간에 이미 발급돼 있는 코드 때문이다(수명 30초).
ALTER TABLE `user_auth_code`
  ADD COLUMN `persistent` TINYINT(1) NOT NULL DEFAULT 1;
