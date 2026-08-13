-- AlterEnum
--
-- 동의 항목에 API 이용약관을 더한다. 앱을 등록할 때 받는 동의라 가입 동의(TERMS·PRIVACY)와
-- 같은 표에 남기되 종류로 갈린다 — 계약 상대가 회원이 아니라 개발자다(API 이용약관 제4조).
--
-- 값을 **뒤에 붙인다.** MySQL 의 ENUM 은 내부적으로 순번으로 저장되므로 중간에 끼워 넣으면
-- 이미 저장된 행의 뜻이 통째로 밀린다.

ALTER TABLE `user_consent`
    MODIFY `type` ENUM('TERMS', 'PRIVACY', 'AGE_14', 'API_TERMS') NOT NULL;
