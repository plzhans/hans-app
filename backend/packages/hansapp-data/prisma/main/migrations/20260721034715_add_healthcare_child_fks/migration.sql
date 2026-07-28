-- healthcare_hospital 자식 테이블에 FK 추가 (ON DELETE CASCADE)
--
-- 원래 i18n 만 FK 였다(20260714170000_add_hospital_i18n_fk). 자식들은 매 빌드마다
-- replace() 로 전량 재생성돼서 고아가 나도 다음 빌드가 쓸어가므로 FK 가 "없어도 됐다".
--
-- 그런데 병원 행을 지우거나 병합할 때(중복 정리 등) 연관 테이블이 많아 일일이 지우기 번거롭다.
-- Cascade FK 로 묶어 병원 한 행을 지우면 자식이 함께 정리되게 한다 — i18n FK 와 같은 취지를
-- 나머지 자식에도 확장한 것이다.
--
-- 참조 컬럼 hospital_id 는 각 테이블 PK 의 (좌측) 구성이라 별도 인덱스가 필요 없다.
-- 삽입 방향은 그대로다: 부모(healthcare_hospital)는 지우지 않고 status 로만 관리하며,
-- 자식은 이미 존재하는 병원 id 로만 삽입되므로 FK 를 만족한다.

ALTER TABLE `healthcare_hospital_subject`
  ADD CONSTRAINT `fk_hc_hospital_subject`
  FOREIGN KEY (`hospital_id`) REFERENCES `healthcare_hospital` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `healthcare_hospital_hours`
  ADD CONSTRAINT `fk_hc_hospital_hours`
  FOREIGN KEY (`hospital_id`) REFERENCES `healthcare_hospital` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `healthcare_hospital_staff`
  ADD CONSTRAINT `fk_hc_hospital_staff`
  FOREIGN KEY (`hospital_id`) REFERENCES `healthcare_hospital` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `healthcare_hospital_bed`
  ADD CONSTRAINT `fk_hc_hospital_bed`
  FOREIGN KEY (`hospital_id`) REFERENCES `healthcare_hospital` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `healthcare_hospital_equipment`
  ADD CONSTRAINT `fk_hc_hospital_equipment`
  FOREIGN KEY (`hospital_id`) REFERENCES `healthcare_hospital` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `healthcare_hospital_capability`
  ADD CONSTRAINT `fk_hc_hospital_capability`
  FOREIGN KEY (`hospital_id`) REFERENCES `healthcare_hospital` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
