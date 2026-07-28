-- 병원 자유 텍스트 번역. 한 병원 × 한 언어 = 한 행.
--
-- 키가 (hospital_id, lang) 인 이유: 언어를 늘릴 때 ALTER 를 치지 않기 위해서다.
-- 컬럼 방식(name_en, name_ja, name_zh …)이면 언어 하나에 컬럼 12개(값 6 + 해시 6)가 붙어
-- 8만 행 테이블을 매번 고쳐야 한다. 행이면 언어 추가 = 행 추가다.
-- 조회도 이 모양이다 — Accept-Language 로 언어를 하나만 고르니 늘 (병원, 언어) 한 건이다.
--
-- 원문 옆(healthcare_hospital)이 아니라 별도 테이블인 이유: healthcare-build 가
-- INSERT … ON DUPLICATE KEY UPDATE 로 병원 행을 덮어쓴다. 지금은 FIELDS 배열에 적힌 컬럼만
-- 건드리지만, 누가 거기에 name_en 을 무심코 넣으면 번역 8만 건이 조용히 NULL 이 된다.
-- 배치가 물리적으로 닿을 수 없는 자리에 둔다.
--
-- FK 는 걸지 않는다. 이 스키마의 다른 자식 테이블도 전부 FK 가 없고(대량 빌드 때문),
-- 병원 행은 삭제하지 않고 status='closed' 로만 두므로 고아 행이 생기지 않는다.

CREATE TABLE `healthcare_hospital_i18n` (
  `hospital_id` INT NOT NULL,

  -- BCP47. 'en' | 'ja' | 훗날 'zh-CN'. 한국어(원문)는 담지 않는다 — 본체에 있다.
  `lang` VARCHAR(10) NOT NULL,

  `name`       VARCHAR(200) NULL,
  `intro`      TEXT NULL,
  `notice`     TEXT NULL,
  `directions` TEXT NULL,
  `park_note`  TEXT NULL,

  -- 번역된 대중교통. 원문과 같은 모양의 JSON 이다.
  -- 본체가 transport 를 행으로 안 쪼갠다고 정했으므로 번역본도 쪼개지 않는다.
  `transport` JSON NULL,

  -- 번역 당시 원문의 MD5. 원문이 바뀌면 불일치 = 재번역 대상.
  -- 필드마다 원문이 다르므로 해시도 필드마다 둔다 — name 만 바뀌었는데 intro 까지
  -- 다시 번역하면 돈이 두 배로 든다.
  `name_src`       CHAR(32) NULL,
  `intro_src`      CHAR(32) NULL,
  `notice_src`     CHAR(32) NULL,
  `directions_src` CHAR(32) NULL,
  `park_note_src`  CHAR(32) NULL,
  `transport_src`  CHAR(32) NULL,

  -- 'claude-haiku-4-5' | 'claude-sonnet-5' | 'dict'(역명 사전) | 'human'
  -- 'human' 인 행은 재번역 잡이 건드리지 않는다. 사람이 고친 걸 기계가 덮으면 안 된다.
  `engine` VARCHAR(20) NULL,

  -- 연속 실패 횟수. 상한이 없으면 실패한 행은 매 실행마다 영원히 재시도된다.
  `attempt_count` TINYINT NOT NULL DEFAULT 0,
  `last_error`    VARCHAR(200) NULL,

  `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  PRIMARY KEY (`hospital_id`, `lang`),

  -- 영문·일문 병원명 검색·정렬. 이게 이 설계의 존재 이유다.
  KEY `idx_hc_hospital_i18n_name` (`lang`, `name`),

  -- 재번역 대상 스캔에서 이미 실패 상한에 걸린 행을 빨리 걷어낸다.
  KEY `idx_hc_hospital_i18n_todo` (`lang`, `attempt_count`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
