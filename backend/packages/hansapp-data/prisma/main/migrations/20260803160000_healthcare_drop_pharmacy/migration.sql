-- DataMigration
--
-- 약국·NMC 기타를 통합 병원에서 걷어낸다. 스키마는 안 바뀐다 — 데이터만 지운다.
--
-- [왜 지우나]
-- healthcare_hospital 에 병원이 아닌 것이 섞여 있었다. 원인은 두 갈래다.
--   1. NMC 기관구분 'H'(약국) · 'I'(기타) 가 무시 목록에 없었다.
--      'I' 는 한약국·요양원·정신보건센터가 뒤섞인 잡탕이고 전수도 아니다
--      (실측 2026-08 develop: 94행 중 한약국 22곳, 그중 18곳이 전남 한 지역).
--   2. HIRA 종별 '81'(약국) 을 PHARMACY 로 매핑해 두었다. 실제 유입은 없었지만
--      원본이 주기 시작하면 그대로 들어온다.
-- 둘 다 시드에서 IGNORED_SOURCE_CODES 로 막았다. 이 마이그레이션은 **이미 들어온 것**을
-- 치운다. 빌드에는 "이번에 안 만든 행을 지우는" 패스가 없어서 저절로 사라지지 않는다.
--
-- [왜 폐업(status='closed')이 아니라 삭제인가]
-- closed 는 요양기관이었다가 문을 닫은 곳에 쓸 값이다. 사용자에게 "폐업" 으로 보여준다.
-- 이 행들은 폐업한 적이 없다 — 애초에 우리 대상이 아니었다. closed 로 두면 나중에
-- 폐업 목록에 한약국·요양원이 섞여 나온다.
--
-- [왜 class_cd='ETC' 로 지우지 않나]
-- ETC 에는 HIRA '99'(비요양기관)·'AA'(병의원)·NMC 'O' 도 매핑된다. 그것들은 이번
-- 제외 대상이 아니라서, ETC 를 통째로 지우면 빌드가 다음 회차에 되살린다.
-- 원본 종별을 직접 보고 **새 빌드가 더는 만들지 않는 행만** 지운다.
--
-- [미러를 참조하는 것에 대하여]
-- healthcare_* 는 런타임에 hira_*/nmc_* 를 보면 안 되지만, 이건 런타임이 아니라
-- 일회성 정리다. 미러를 지운 뒤라면 JOIN 이 0건이 되어 아무것도 안 지운다 —
-- 그때는 이 마이그레이션이 이미 적용된 뒤다.
--
-- source='manual'(직접 등록)은 어느 조건에도 걸리지 않는다. 배치가 안 건드리는 값이라
-- 원본 종별로 판단할 근거가 없고, 사람이 일부러 넣은 것이라 지울 이유도 없다.

-- ① NMC 단독 병원 중 무시 대상 기관구분.
--    source='nmc' 가 곧 "NMC 에만 있다" 는 뜻이다. HIRA 와 매칭된 것(hira_nmc)은
--    HIRA 종별로 들어오므로 여기 안 걸린다 — 조산원 10곳이 그 경우다.
DELETE h FROM `healthcare_hospital` h
    JOIN `nmc_hospital` n ON n.`hpid` = h.`hpid`
 WHERE h.`source` = 'nmc'
   AND n.`duty_div` IN ('H', 'I');

-- ② HIRA 종별 81(약국). 현재 원본이 주지 않아 0건이지만, 조건을 남겨 둔다 —
--    이 마이그레이션이 도는 시점의 미러 상태를 우리가 확정할 수 없다.
DELETE h FROM `healthcare_hospital` h
    JOIN `hira_hospital` x ON x.`ykiho` = h.`ykiho`
 WHERE h.`source` <> 'manual'
   AND x.`cl_cd` = '81';

-- ③ 위 둘로 안 걸리는 잔여 약국. 미러가 이미 정리된 뒤라면 ①②가 못 잡는다.
--    healthcare_code 의 PHARMACY 행은 `db seed` 가 지운다(시드에서 빠졌다) —
--    그러면 이 행들은 이름 없는 종별을 가리키게 되므로 같이 치운다.
DELETE FROM `healthcare_hospital`
 WHERE `class_cd` = 'PHARMACY'
   AND `source` <> 'manual';

-- ④ 고아가 된 확인상태 행.
--    healthcare_hospital_section 만 FK 가 없어 부모를 지워도 Cascade 가 안 걸린다
--    (나머지 자식 테이블은 ON DELETE Cascade 로 함께 지워진다).
DELETE x FROM `healthcare_hospital_section` x
    LEFT JOIN `healthcare_hospital` h ON h.`id` = x.`hospital_id`
 WHERE h.`id` IS NULL;

-- ⑤ 보건의료원을 병원급으로 올린다.
--    지역보건법 제12조가 "병원의 요건을 갖춘 보건소" 로 정의하고, 인력도 병원 평균을
--    넘는다(실측 2026-08: 의사 11.6명 vs 병원 7.4명). 16곳 전부 군 단위라 그 지역에서
--    입원 가능한 유일한 시설인 경우가 많은데, TIER1 이면 "병원급 이상" 검색에서 빠진다.
--
--    시드(HOSPITAL_TIERS)를 같이 고쳤으므로 다음 빌드가 같은 값을 다시 넣는다.
--    여기서 미리 바꾸는 것은 빌드 전까지의 공백을 없애기 위해서다.
UPDATE `healthcare_hospital`
   SET `tier` = 'TIER2'
 WHERE `class_cd` = 'HEALTH_MED'
   AND `tier` = 'TIER1';
