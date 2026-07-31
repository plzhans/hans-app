-- AlterTable
--
-- 인가코드에 **이번 로그인에 쓴 수단**을 담는다. 가입 방식(user.join_type)이 아니다 —
-- 이메일로 가입한 사람이 구글을 연동해 로그인할 수 있고, 그때 남아야 할 값은 GOOGLE 이다.
--
-- 소셜 콜백과 코드 교환은 다른 요청이라, 교환 시점에는 provider 를 알 방법이 없었다.
-- 그래서 로그인 로그가 join_type 으로 근사되어 "오늘 무엇으로 들어왔나" 가 사라졌다.
--
-- NULL 허용은 기존 행 때문이다. 새로 발급되는 코드에는 항상 채워진다.
-- (수명이 30초라 배포 직후 잠깐만 NULL 인 행이 남고 곧 사라진다.)
ALTER TABLE `user_auth_code`
    ADD COLUMN `provider` ENUM('EMAIL', 'GOOGLE', 'NAVER', 'KAKAO', 'LINE') NULL;
