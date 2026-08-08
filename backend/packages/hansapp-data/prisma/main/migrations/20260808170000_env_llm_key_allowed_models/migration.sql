-- AlterTable
-- **잠금 목록을 허용 목록으로 뒤집는다.**
--
-- locked_models 는 "곧 열린다" 를 화면에 그리는 표시용이었고 호출에는 안 쓰였다. 그래서
-- 업체가 모델을 새로 내면 그 순간 아무 장치도 없이 부를 수 있는 상태가 된다 —
-- 목록에 없으면 못 쓰는 쪽이 맞다(모델이 곧 단가라서 더 그렇다).
--
-- 이름만 바꾼다. 값의 뜻이 정반대가 되지만 지금 어느 환경에도 행이 없어 옮길 데이터가 없다.
ALTER TABLE `env_llm_key` CHANGE `locked_models` `allowed_models` VARCHAR(500) NULL;
