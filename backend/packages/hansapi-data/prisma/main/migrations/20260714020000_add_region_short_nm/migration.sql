-- AlterTable
-- 화면 표시용 짧은 이름. 검색·매칭은 nm(정식 명칭)으로 하고, 표시만 이걸 쓴다.
-- 규칙으로 못 만든다 — 접미사만 떼면 "충청북"(X), "전남광주통합"(X) 이 된다.
ALTER TABLE `region_code` ADD COLUMN `short_nm` VARCHAR(20) NULL;
