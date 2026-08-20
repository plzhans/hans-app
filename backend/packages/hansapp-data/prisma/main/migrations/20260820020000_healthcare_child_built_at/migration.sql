-- 통합 병원 하위 테이블에 "이번 빌드가 확인한 시각" 을 둔다.
--
-- **갈아엎기를 upsert 로 바꾸기 위한 열이다.** 지금 상세 빌드는 매번 표를 통째로 비우고
-- (`DELETE FROM <table>` — WHERE 없이) 다시 채운다. 그 방식의 문제는 셋이다:
--
--   1. 비운 뒤 채우는 사이에 **데이터가 사라져 보인다.** 트랜잭션도 없어서 창이 그대로 열린다.
--   2. 중간에 죽으면 **비워진 채로 남는다.**
--   3. 86만 행을 지웠다가 다시 넣는다 — 실제로 바뀐 것은 몇 건뿐인데도.
--
-- 갈아엎기가 유일하게 사는 명분은 "원본에서 사라진 행"을 저절로 없애 준다는 것이었다.
-- 그건 이 열 하나로 대신할 수 있다:
--
--   INSERT ... ON DUPLICATE KEY UPDATE ..., built_at = <회차 시각>   -- 전량 upsert
--   DELETE FROM <table> WHERE built_at < <회차 시각>                  -- 이번에 안 나온 것만
--
-- 하위 테이블은 전부 자연키(hospital_id + 나머지)라 upsert 가 그대로 먹는다.
-- healthcare_hospital_section 은 이미 같은 열을 갖고 있다 — 그쪽 선례를 나머지로 넓히는 것이다.
--
-- 기존 행은 현재 시각으로 채워진다. 다음 빌드가 전량을 다시 찍으므로 초기값은 뜻이 없다.

ALTER TABLE `healthcare_hospital_subject`
    ADD COLUMN `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `healthcare_hospital_hours`
    ADD COLUMN `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `healthcare_hospital_staff`
    ADD COLUMN `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `healthcare_hospital_bed`
    ADD COLUMN `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `healthcare_hospital_equipment`
    ADD COLUMN `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE `healthcare_hospital_capability`
    ADD COLUMN `built_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP;
