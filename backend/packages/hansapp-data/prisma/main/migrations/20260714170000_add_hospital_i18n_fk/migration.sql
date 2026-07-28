-- healthcare_hospital_i18n → healthcare_hospital FK (ON DELETE CASCADE)
--
-- **이 스키마의 유일한 FK 다.** 다른 자식 테이블(_subject, _hours, _bed …)에는 없다.
-- 예외를 두는 이유:
--
-- 지금 병원 행은 지우지 않는다. 원본에서 사라져도 status='closed' 로 남긴다.
-- 하지만 그건 **운영 정책**이지 구조적 보장이 아니다. 정책은 바뀌고, 중복 병합이나
-- 데이터 정리 작업은 언젠가 들어온다. 그때 번역만 고아로 남는 걸 사람의 규율에 맡기지 않는다.
--
-- 다른 자식 테이블에 FK 가 없어도 되는 이유: 걔들은 매 빌드마다 통째로 지워지고 다시 만들어진다
-- (healthcare-detail-build 의 replace()). 고아가 생겨도 다음 빌드가 쓸어간다.
-- 번역은 다르다 — 다시 만들 수 없다. 돈과 시간을 들여 얻은 값이다.

ALTER TABLE `healthcare_hospital_i18n`
  ADD CONSTRAINT `fk_hc_hospital_i18n`
  FOREIGN KEY (`hospital_id`) REFERENCES `healthcare_hospital` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
