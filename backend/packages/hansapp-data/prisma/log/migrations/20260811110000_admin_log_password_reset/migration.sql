-- 로그인 화면의 "비밀번호 찾기" 를 기록하기 위한 종류 두 가지.
--
--   PASSWORD_RESET_REQUEST  재설정 메일을 보내 달라고 한 것. **없는 계정으로의 요청도 남는다**
--                           (admin_id 없이 email 만) — 남의 주소를 넣어 보는 시도가 여기서만 보인다.
--   PASSWORD_RESET          그 링크로 본인이 비밀번호를 다시 세운 것.
--
-- 관리자가 남의 비밀번호를 다시 내주는 ADMIN_PASSWORD_RESET 과 갈라 둔다 —
-- 한쪽은 본인이 한 일이고 다른 쪽은 남이 해 준 일이라 되짚을 때 묻는 질문이 다르다.
--
-- ENUM 에 값을 **뒤에 더하는 것**은 MySQL 에서 in-place 다(기존 값의 내부 번호가 그대로다).

-- AlterTable
ALTER TABLE `admin_action_log`
  MODIFY COLUMN `action` ENUM('LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ADMIN_CREATE', 'ADMIN_UPDATE', 'ADMIN_DELETE', 'ADMIN_PASSWORD_RESET', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET') NOT NULL;
