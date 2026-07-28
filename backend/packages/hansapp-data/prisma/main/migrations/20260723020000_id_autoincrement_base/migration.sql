-- 앱/클라이언트 id 의 AUTO_INCREMENT 시작값을 크게 잡는다.
-- (식별자가 1,2,3… 로 노출되지 않게. 기존 행이 있어도 현재 max id 보다 크면 다음 insert 부터 적용된다.)
ALTER TABLE `app` AUTO_INCREMENT = 10000;
ALTER TABLE `app_client` AUTO_INCREMENT = 100000;
