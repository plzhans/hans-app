-- HIRA 비급여 항목 코드마스터.
--
-- **hira_code 와 구조가 같다** — 코드값 + 이름 + i18n + 상위계층. 데이터 계보가 다르고(비급여
-- 항목 vs 기관 속성 코드) 655행 규모라, 통합하지 않고 규약만 그대로 따라 테이블을 나눈다.
-- hira_hospital_asm 을 hira_code 와 나눈 것과 같은 판단이다.
--
-- **계층은 중분류 > 소분류 > 항목 고정 3단이고 코드가 전부 중첩된다**(2026-07 실측 567/567):
--   중분류 1010A(상급병실료) > 소분류 1010A010(1인실) > 항목 ABZ010001(상급병실료/1인실)
-- 원본 npayKorNm 슬래시 깊이가 2~5로 보이지만 계층이 아니라 소분류 이름에 슬래시가 있어서다.
-- 대분류(npayLdivCd)는 원본이 늘 비워 보내 담지 않는다.
--
-- **적재는 데이터가 들어올 때 한다** — 전수 스캔이 아니라 관측된 것만 쌓는다(region_code 와 같은 방식).
-- 분류코드(mdiv/sdiv)는 요약(getNonPaymentItemHospList2)과 크롤(op='npay-web')에만 있다 —
-- 상세(getNonPaymentItemHospDtlList)엔 npayCd 뿐이라 분류코드를 못 준다. 그래서 분류코드 컬럼은
-- NULL 을 허용한다: 분류코드 없는 경로가 먼저 코드·이름만 만들 수 있고, 나중 경로가 채운다.
-- **채우는 쪽은 값이 있을 때만 갱신한다** — 이미 채워둔 분류코드를 NULL 로 덮지 않게.
CREATE TABLE `hira_npay_code` (
    -- 비급여 항목코드(원본 npayCd). 잎 코드다. **number/string 혼재로 오므로 문자열로 고정한다.**
    `cd` VARCHAR(20) NOT NULL,

    -- 항목 전체명(원본 npayKorNm). '중분류/소분류/항목' 슬래시 결합 그대로.
    `cd_nm` VARCHAR(400) NOT NULL,
    -- [i18n] asm 과 같은 규칙 — 지금 NULL, 나중에 AI 번역이 채운다.
    `cd_nm_en` VARCHAR(400) NULL,
    `cd_nm_ja` VARCHAR(400) NULL,
    `cd_nm_zh` VARCHAR(400) NULL,

    -- 소분류(원본 npaySdivCd/Nm). 중분류 코드로 시작해 중첩된다. 분류코드 없는 경로로 먼저 만들어지면 NULL.
    `sdiv_cd` VARCHAR(20) NULL,
    `sdiv_nm` VARCHAR(400) NULL,

    -- 중분류(원본 npayMdivCd/Nm). 상위 계층이자 화면 그룹 헤더. hira_code 의 tp/tp_nm 자리다.
    `mdiv_cd` VARCHAR(20) NULL,
    `mdiv_nm` VARCHAR(200) NULL,
    `mdiv_nm_en` VARCHAR(200) NULL,
    `mdiv_nm_ja` VARCHAR(200) NULL,
    `mdiv_nm_zh` VARCHAR(200) NULL,

    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `synced_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    -- 중분류·소분류로 묶어 조회한다(화면 그룹핑). 항목명 검색도 있다.
    INDEX `idx_hira_npay_code_mdiv`(`mdiv_cd`),
    INDEX `idx_hira_npay_code_sdiv`(`sdiv_cd`),
    INDEX `idx_hira_npay_code_nm`(`cd_nm`),
    -- npayCd 는 항목마다 유일하다(hira_code 와 달리 복합키가 아니다).
    PRIMARY KEY (`cd`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
