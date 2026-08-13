-- 관리자 등급.
--
-- **기본값이 가장 높은 SYSTEM 이다.** 이미 있는 계정은 등급이 나뉘기 전에 만들어진 것들이라
-- 지금까지 하던 일을 그대로 할 수 있어야 한다 — 낮은 등급으로 떨어뜨리면 남의 계정을 못
-- 고치게 되고, 그중 하나뿐인 계정이 그렇게 되면 아무도 등급을 되돌릴 수 없다.
--
-- CLI·부팅 부트스트랩으로 만드는 계정도 이 기본값을 그대로 쓴다(등급을 받을 자리가 없다).

-- AlterTable
ALTER TABLE `admin_user`
  ADD COLUMN `role` ENUM('SYSTEM', 'ADMIN', 'OPERATOR') NOT NULL DEFAULT 'SYSTEM';
