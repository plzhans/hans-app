-- 회원·관리자에게 국가·언어·타임존을 붙인다.
--
-- 언어와 타임존은 본인이 바꾸는 값이고, 국가는 집계용으로 가입 때 한 번 적고 마는 값이다.
-- 오프셋(GMT+9)이 아니라 IANA 존 ID 를 저장한다 — 서머타임 때문에 오프셋은 해마다 흔들린다.

-- 회원은 전부 nullable 이다. 기존 행에 채워 넣을 근거가 없고,
-- **"모름" 과 "한국으로 골랐음" 은 다른 상태다** — 비어 있으면 요청 헤더로 떨어진다.
ALTER TABLE `user`
  ADD COLUMN `country_code` CHAR(2) NULL,
  ADD COLUMN `language` VARCHAR(2) NULL,
  ADD COLUMN `time_zone` VARCHAR(64) NULL;

-- 관리자는 반대로 NOT NULL + 기본값이다. 가입 화면이 없어(CLI·부트스트랩으로만 생성)
-- 브라우저에서 값을 받을 자리가 없으므로, 기존 행이든 새 행이든 한국 기준에서 시작한다.
ALTER TABLE `admin_user`
  ADD COLUMN `country_code` CHAR(2) NOT NULL DEFAULT 'KR',
  ADD COLUMN `language` VARCHAR(2) NOT NULL DEFAULT 'ko',
  ADD COLUMN `time_zone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul';
