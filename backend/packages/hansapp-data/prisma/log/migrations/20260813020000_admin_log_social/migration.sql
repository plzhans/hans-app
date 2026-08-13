-- 관리자 계정에 소셜(구글)을 붙이고 떼는 일을 기록하기 위한 종류 두 가지.
--
--   SOCIAL_LINK    자기 계정에 소셜을 붙였다.
--   SOCIAL_UNLINK  붙여 둔 소셜을 떼었다.
--
-- **소셜 로그인 자체는 LOGIN 그대로 쓴다.** 무엇으로 들어왔는지는 detail(via)에 남는다 —
-- 종류를 늘리면 "언제 로그인했나" 를 묻는 조회가 값 두 개를 알아야 한다.
--
-- ENUM 에 값을 뒤에 더하는 것은 MySQL 에서 in-place 다(기존 값의 내부 번호가 그대로다).

-- AlterTable
ALTER TABLE `admin_action_log`
  MODIFY COLUMN `action` ENUM('LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_CREATE', 'ADMIN_UPDATE', 'ADMIN_DELETE', 'ADMIN_PASSWORD_RESET', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET', 'SOCIAL_LINK', 'SOCIAL_UNLINK') NOT NULL;
