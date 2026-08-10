-- AlterTable
-- 남이 정해 준 비밀번호(부팅 자동 생성·CLI 발급·운영자 초기화)를 쓰는 계정은
-- 다음 로그인에서 반드시 바꾸게 한다. 기본값 false 라 기존 행은 영향을 받지 않는다.
ALTER TABLE `admin_user` ADD COLUMN `must_change_password` BOOLEAN NOT NULL DEFAULT false;
