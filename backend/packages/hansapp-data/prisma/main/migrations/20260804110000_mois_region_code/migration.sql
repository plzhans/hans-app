-- CreateTable
--
-- 행정안전부 법정동코드 미러. 출처: StanReginCd/getStanReginCdList (@krdata/mois)
--
-- 다른 미러와 성격이 다르다. 이건 지역의 원천이라 배치가 가장 먼저 돌린다 —
-- HIRA(코드)와 NMC(이름)가 서로 다른 방식으로 주는 지역을 우리 코드로 옮기려면
-- 기준이 되는 정본이 먼저 있어야 한다.
--
-- [FK 를 걸지 않는다]
-- locathigh_cd 는 상위지역코드지만 참조 무결성이 없다. 목록에 없는 코드를 가리키는 행이
-- 2건, 값이 공백인 행이 2건, 자릿수로 계산한 상위와 다른 행이 16건 있다. (2026-08 실측)
-- FK 를 걸면 적재 자체가 실패한다.
--
-- [level 은 파생 컬럼이지만 generated column 이 아니다]
-- 코드 자릿수로 결정되지만 세종(3611000000)처럼 원본이 규칙을 벗어나는 행이 있어
-- 나중에 보정이 필요할 수 있다. 식을 DB 에 박으면 그때 마이그레이션을 새로 써야 한다.
-- 적재하는 쪽(mois-region-sync)이 계산해 넣는다.
--
-- [COMMENT 는 DB 명세서의 설명 항목이다]
-- Prisma 스키마에는 DB COMMENT 를 선언할 문법이 없어 여기 직접 적는다.
-- 명세서에 그대로 실리는 값이므로 **항목명 수준으로 짧고 균일하게** 유지한다.
-- 배경·판단 근거는 여기 헤더 주석과 schema.prisma 의 `///` 에 둔다.
-- 컬럼을 바꾸는 마이그레이션을 쓸 때 COMMENT 를 같이 적지 않으면 조용히 날아간다.
CREATE TABLE `mois_region_code` (
    `region_cd` VARCHAR(10) NOT NULL COMMENT '지역코드 (시도2+시군구3+읍면동3+리2)',
    `sido_cd` VARCHAR(2) NOT NULL COMMENT '시도코드',
    `sgg_cd` VARCHAR(3) NOT NULL COMMENT '시군구코드',
    `umd_cd` VARCHAR(3) NOT NULL COMMENT '읍면동코드',
    `ri_cd` VARCHAR(2) NOT NULL COMMENT '리코드',
    `locatadd_nm` VARCHAR(100) NOT NULL COMMENT '지역주소명 (상위 포함 전체)',
    `locallow_nm` VARCHAR(50) NULL COMMENT '최하위지역명',
    `level` VARCHAR(10) NOT NULL COMMENT '지역단계 (sido/sggu/umd/ri)',
    `locathigh_cd` VARCHAR(10) NULL COMMENT '상위지역코드',
    `locatjumin_cd` VARCHAR(10) NULL COMMENT '주민등록 지역코드',
    `locatjijuk_cd` VARCHAR(10) NULL COMMENT '지적 지역코드',
    `locat_order` INTEGER NULL COMMENT '정렬순서',
    `locat_rm` TEXT NULL COMMENT '비고 (개편 근거 조례명)',
    `adpt_de` VARCHAR(8) NULL COMMENT '생성일 (YYYYMMDD)',
    `removed_at` DATETIME(0) NULL COMMENT '폐지일시',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수정일시',
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '동기화일시',

    INDEX `idx_mois_region_code_level`(`level`, `sido_cd`, `sgg_cd`),
    INDEX `idx_mois_region_code_addr`(`locatadd_nm`),
    INDEX `idx_mois_region_code_removed`(`removed_at`, `synced_at`),
    PRIMARY KEY (`region_cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT = '법정동코드 (행정안전부 행정표준코드)';
