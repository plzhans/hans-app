-- 단계 단위 on/off 와 단계 설명.
--
-- **개발서버와 운영이 같은 서비스키를 쓴다.** data.go.kr 의 일일 한도는 키 단위라, dev 가
-- 개별 상세(hira 2~12단계)를 훑으면 그만큼이 운영 몫에서 빠진다. 잡 단위(batch_job.enabled)
-- 로는 너무 굵다 — hira 를 통째로 끄면 싸고 중요한 목록 단계(1)까지 멈춘다.
--
-- enabled 는 **DB 가 정본이다.** 관리자가 콘솔에서 끈 값이라 부팅 때 덮어쓰지 않는다.
-- description 은 반대로 거울이다 — 정본은 코드(STAGE_CATALOG)이고 부팅 때 실어 넣는다.
--
-- 기본값이 true 라 기존 행과 운영은 지금과 똑같이 돈다. 끄는 것은 dev 에서 손으로 한다.

ALTER TABLE `sync_state`
    ADD COLUMN `description` VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true;
