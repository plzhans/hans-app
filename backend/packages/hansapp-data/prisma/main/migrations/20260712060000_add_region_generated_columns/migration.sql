-- 지역 검색용 generated column + 인덱스.
--
-- 병원 데이터는 JSON 통째로 보관하므로 지역으로 검색하려면 JSON 을 매번 뒤져야 한다(풀스캔).
-- 검색에 쓰는 값만 generated column 으로 뽑아 인덱스를 건다.
--
-- VIRTUAL 을 쓴다. 값을 저장하지 않고 읽을 때 계산하지만, 보조 인덱스는 그대로 걸리므로
-- 검색 성능은 STORED 와 같다. 대신 테이블을 재작성하지 않아 추가가 즉시 끝난다.
--
-- Prisma 는 generated column 을 표현하지 못한다. schema.prisma 에는 평범한 컬럼으로 적혀 있고
-- (읽기 위해), 실제 정의는 이 파일이 유일하다. 식을 바꾸려면 새 마이그레이션을 써야 한다.

-- NMC: 지역이 원본에 없다. @krdata/nmc SDK 가 dutyAddr 를 파싱해 sidoNm/sgguNm 을 채워 준다.
--      그래서 여기서는 HIRA 와 똑같이 JSON 필드를 꺼내기만 한다.
ALTER TABLE `nmc_hospital`
  ADD COLUMN `sido_nm` VARCHAR(20)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.sidoNm'))) VIRTUAL,
  ADD COLUMN `sggu_nm` VARCHAR(30)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.sgguNm'))) VIRTUAL;

CREATE INDEX `idx_nmc_hospital_region` ON `nmc_hospital` (`sido_nm`, `sggu_nm`);

-- HIRA: 원본이 시도·시군구를 코드와 이름으로 함께 준다. 동은 이름만 주고 코드가 없다.
-- 코드는 숫자로 오기도 해서(sidoCd=310000) JSON_UNQUOTE 로 문자열로 맞춘다.
ALTER TABLE `hira_hospital`
  ADD COLUMN `sido_cd` VARCHAR(10)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.sidoCd'))) VIRTUAL,
  ADD COLUMN `sido_nm` VARCHAR(20)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.sidoCdNm'))) VIRTUAL,
  ADD COLUMN `sggu_cd` VARCHAR(10)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.sgguCd'))) VIRTUAL,
  ADD COLUMN `sggu_nm` VARCHAR(30)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.sgguCdNm'))) VIRTUAL,
  ADD COLUMN `emdong_nm` VARCHAR(30)
    GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.emdongNm'))) VIRTUAL;

CREATE INDEX `idx_hira_hospital_region_cd` ON `hira_hospital` (`sido_cd`, `sggu_cd`);
CREATE INDEX `idx_hira_hospital_region_nm` ON `hira_hospital` (`sido_nm`, `sggu_nm`, `emdong_nm`);
