-- FK 적용 전 고아행 점검. 모든 orphans 가 0 이어야 ALTER 가 성공한다.
-- (자식은 매 빌드 전량 재생성이라 보통 0이지만, 적용 시점에 반드시 확인한다.)
SELECT 'subject' AS tbl, COUNT(*) AS orphans
  FROM healthcare_hospital_subject c
  LEFT JOIN healthcare_hospital h ON h.id = c.hospital_id
 WHERE h.id IS NULL
UNION ALL
SELECT 'hours', COUNT(*)
  FROM healthcare_hospital_hours c
  LEFT JOIN healthcare_hospital h ON h.id = c.hospital_id
 WHERE h.id IS NULL
UNION ALL
SELECT 'staff', COUNT(*)
  FROM healthcare_hospital_staff c
  LEFT JOIN healthcare_hospital h ON h.id = c.hospital_id
 WHERE h.id IS NULL
UNION ALL
SELECT 'bed', COUNT(*)
  FROM healthcare_hospital_bed c
  LEFT JOIN healthcare_hospital h ON h.id = c.hospital_id
 WHERE h.id IS NULL
UNION ALL
SELECT 'equipment', COUNT(*)
  FROM healthcare_hospital_equipment c
  LEFT JOIN healthcare_hospital h ON h.id = c.hospital_id
 WHERE h.id IS NULL
UNION ALL
SELECT 'capability', COUNT(*)
  FROM healthcare_hospital_capability c
  LEFT JOIN healthcare_hospital h ON h.id = c.hospital_id
 WHERE h.id IS NULL;
