-- 통합 병원에 "내용이 마지막으로 바뀐 시각" 을 만든다.
--
-- updated_at 은 이미 있지만 죽어 있다. 빌드가 raw SQL 로 쓰는데 ON DUPLICATE KEY UPDATE 의
-- 갱신 목록에 없고, 컬럼에 ON UPDATE CURRENT_TIMESTAMP 도 없다. 그래서 모든 행이 created_at
-- 값에 멈춰 있다.
--
-- 컬럼에 ON UPDATE CURRENT_TIMESTAMP 를 거는 것으로는 해결되지 않는다. 같은 upsert 가
-- built_at = NOW() 를 늘 함께 찍어서, 값이 하나도 안 바뀐 행도 MySQL 에는 갱신된 행으로
-- 보인다 — 매 회차 8만 건이 전부 "오늘 수정됨" 이 된다. built_at 을 뺄 수도 없다.
-- 이번에 안 나온 행을 지우는 스윕(built_at < 회차 시각)의 유일한 근거다.
--
-- 그래서 "이번에 봤다"(built_at)와 "값이 바뀌었다"(updated_at)를 가르고, 후자의 판정을
-- 앱으로 옮긴다. 빌드는 자기가 만든 값의 해시를 직전 회차 해시와 맞대 보고, 다른 병원만
-- updated_at 을 이번 회차 시각으로 찍는다. SQL 은 컬럼 비교를 하지 않는다.
--
--   build_hash    본체 행 내용
--   detail_hash   자식 6표(과목·시간·인력·병상·장비·capability)를 병원 단위로 묶은 것
--
-- 자식은 행이 사라지는 것도 변경이다. 지워진 행은 해시 입력에서 빠지므로 값이 달라진다 —
-- 스윕 전에 대상 hospital_id 를 따로 걷어 둘 필요가 없다.
--
-- 두 해시는 NULL 로 시작한다. 빌드는 NULL 을 "기준선이 없다" 로 읽어 해시만 심고
-- updated_at 을 건드리지 않는다. 도입 회차에 전건이 수정된 것으로 찍히는 것을 막는다.

ALTER TABLE `healthcare_hospital`
    ADD COLUMN `build_hash` CHAR(32) NULL,
    ADD COLUMN `detail_hash` CHAR(32) NULL;
